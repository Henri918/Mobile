from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
import bcrypt
import os
import secrets
from functools import wraps

app = Flask(__name__)
CORS(app)


DB_HOST = os.getenv("DB_HOST", "mysql")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "login")

tokens = {}

def conectar():
    return mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )


def usuario_token():
    """Retorna o usuário referente ao Bearer Token."""

    auth = request.headers.get("Authorization", "")

    if not auth.startswith("Bearer "):
        return None

    token = auth.replace("Bearer ", "", 1).strip()

    if not token:
        return None

    return tokens.get(token)


def login_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):

        usuario = usuario_token()

        if not usuario:
            return jsonify({
                "success": False,
                "message": "Não autenticado"
            }), 401

        request.usuario = usuario

        return func(*args, **kwargs)

    return wrapper


def admin_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):

        usuario = usuario_token()

        if not usuario:
            return jsonify({
                "success": False,
                "message": "Não autenticado"
            }), 401

        if usuario["tipo"] != "admin":
            return jsonify({
                "success": False,
                "message": "Acesso permitido somente para administradores"
            }), 403

        request.usuario = usuario

        return func(*args, **kwargs)

    return wrapper


@app.get("/")
def inicio():
    return jsonify({
        "success": True,
        "message": "API do Almoxarifado funcionando"
    })


@app.get("/api/health")
def health():

    banco = None

    try:
        banco = conectar()

        return jsonify({
            "success": True,
            "message": "Flask e MySQL funcionando"
        })

    except Exception as erro:

        print("ERRO HEALTH:", erro)

        return jsonify({
            "success": False,
            "message": "MySQL indisponível"
        }), 500

    finally:

        if banco and banco.is_connected():
            banco.close()


@app.post("/api/login")
@app.post("/api/auth/login")
def login():

    dados = request.get_json(silent=True) or {}

    email = str(dados.get("email", "")).strip().lower()
    senha = str(dados.get("senha", ""))

    if not email or not senha:
        return jsonify({
            "success": False,
            "message": "Preencha e-mail e senha"
        }), 400

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, email, senha, tipo
            FROM usuario
            WHERE email = %s
            """,
            (email,)
        )

        usuario = cursor.fetchone()

        if not usuario:
            return jsonify({
                "success": False,
                "message": "E-mail ou senha incorretos"
            }), 401

        try:
            senha_correta = bcrypt.checkpw(
                senha.encode("utf-8"),
                usuario["senha"].encode("utf-8")
            )
        except Exception:
            senha_correta = False

        if not senha_correta:
            return jsonify({
                "success": False,
                "message": "E-mail ou senha incorretos"
            }), 401

        # Cria token
        token = secrets.token_urlsafe(32)

        usuario_publico = {
            "id": usuario["id"],
            "email": usuario["email"],
            "tipo": usuario["tipo"]
        }

        tokens[token] = usuario_publico

        return jsonify({
        "success": True,
        "message": "Login realizado com sucesso",
        "data": {
            "token": token,
            "user": usuario_publico
        }
        }), 200

    except Exception as erro:

        print("ERRO LOGIN:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao realizar login"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()


@app.post("/api/auth/logout")
@login_required
def logout():

    auth = request.headers.get("Authorization", "")
    token = auth.replace("Bearer ", "", 1).strip()

    if token in tokens:
        del tokens[token]

    return jsonify({
        "success": True,
        "message": "Logout realizado"
    })


# =========================================================
# USUÁRIO LOGADO
# =========================================================

@app.get("/api/auth/me")
@login_required
def me():

    return jsonify({
        "success": True,
        "user": request.usuario
    })



@app.post("/api/register")
@app.post("/api/auth/register")
def register():

    dados = request.get_json(silent=True) or {}

    email = str(dados.get("email", "")).strip().lower()
    senha = str(dados.get("senha", ""))

    if not email or not senha:
        return jsonify({
            "success": False,
            "message": "Preencha e-mail e senha"
        }), 400

    if len(senha) < 6:
        return jsonify({
            "success": False,
            "message": "A senha deve ter pelo menos 6 caracteres"
        }), 400

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor(dictionary=True)

        cursor.execute(
            "SELECT id FROM usuario WHERE email = %s",
            (email,)
        )

        if cursor.fetchone():
            return jsonify({
                "success": False,
                "message": "Este e-mail já está cadastrado"
            }), 409

        senha_hash = bcrypt.hashpw(
            senha.encode("utf-8"),
            bcrypt.gensalt()
        ).decode("utf-8")

        cursor.execute(
            """
            INSERT INTO usuario (email, senha, tipo)
            VALUES (%s, %s, %s)
            """,
            (email, senha_hash, "usuario")
        )

        banco.commit()

        novo_usuario = {
            "id": cursor.lastrowid,
            "email": email,
            "tipo": "usuario"
        }

        return jsonify({
            "success": True,
            "message": "Conta criada com sucesso",
            "user": novo_usuario
        }), 201

    except Exception as erro:

        if banco:
            banco.rollback()

        print("ERRO REGISTER:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao criar conta"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()


@app.get("/api/produtos")
@login_required
def listar_produtos():

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                id,
                nome,
                categoria,
                quantidade,
                estoque_minimo,
                preco,
                foto
            FROM produtos
            ORDER BY id DESC
            """
        )

        produtos = cursor.fetchall()

        return jsonify({
            "success": True,
            "data": produtos
        })

    except Exception as erro:

        print("ERRO PRODUTOS:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao buscar produtos"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()



@app.get("/api/produtos/<int:produto_id>")
@login_required
def buscar_produto(produto_id):

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                id,
                nome,
                categoria,
                quantidade,
                estoque_minimo,
                preco,
                foto
            FROM produtos
            WHERE id = %s
            """,
            (produto_id,)
        )

        produto = cursor.fetchone()

        if not produto:
            return jsonify({
                "success": False,
                "message": "Produto não encontrado"
            }), 404

        return jsonify({
            "success": True,
            "data": produto
        })

    except Exception as erro:

        print("ERRO BUSCAR PRODUTO:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao buscar produto"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()



@app.post("/api/produtos")
@admin_required
def criar_produto():

    dados = request.get_json(silent=True) or {}

    nome = str(dados.get("nome", "")).strip()
    categoria = str(dados.get("categoria", "")).strip()

    quantidade = dados.get("quantidade", 0)
    estoque_minimo = dados.get("estoque_minimo", 0)
    preco = dados.get("preco", 0)
    foto = dados.get("foto")

    if not nome or not categoria:
        return jsonify({
            "success": False,
            "message": "Nome e categoria são obrigatórios"
        }), 400

    try:
        quantidade = int(quantidade)
        estoque_minimo = int(estoque_minimo)
        preco = float(preco)
    except (ValueError, TypeError):

        return jsonify({
            "success": False,
            "message": "Valores inválidos"
        }), 400

    if quantidade < 0 or estoque_minimo < 0 or preco < 0:
        return jsonify({
            "success": False,
            "message": "Os valores não podem ser negativos"
        }), 400

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor()

        cursor.execute(
            """
            INSERT INTO produtos
            (nome, categoria, quantidade, estoque_minimo, preco, foto)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                nome,
                categoria,
                quantidade,
                estoque_minimo,
                preco,
                foto
            )
        )

        banco.commit()

        return jsonify({
            "success": True,
            "message": "Produto criado com sucesso",
            "data": {
                "id": cursor.lastrowid
            }
        }), 201

    except Exception as erro:

        if banco:
            banco.rollback()

        print("ERRO CRIAR PRODUTO:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao criar produto"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()



@app.put("/api/produtos/<int:produto_id>")
@admin_required
def editar_produto(produto_id):

    dados = request.get_json(silent=True) or {}

    nome = str(dados.get("nome", "")).strip()
    categoria = str(dados.get("categoria", "")).strip()

    quantidade = dados.get("quantidade", 0)
    estoque_minimo = dados.get("estoque_minimo", 0)
    preco = dados.get("preco", 0)
    foto = dados.get("foto")

    if not nome or not categoria:
        return jsonify({
            "success": False,
            "message": "Nome e categoria são obrigatórios"
        }), 400

    try:

        quantidade = int(quantidade)
        estoque_minimo = int(estoque_minimo)
        preco = float(preco)

    except (ValueError, TypeError):

        return jsonify({
            "success": False,
            "message": "Valores inválidos"
        }), 400

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor()

        cursor.execute(
            "SELECT id FROM produtos WHERE id = %s",
            (produto_id,)
        )

        if not cursor.fetchone():
            return jsonify({
                "success": False,
                "message": "Produto não encontrado"
            }), 404

        cursor.execute(
            """
            UPDATE produtos
            SET
                nome = %s,
                categoria = %s,
                quantidade = %s,
                estoque_minimo = %s,
                preco = %s,
                foto = %s
            WHERE id = %s
            """,
            (
                nome,
                categoria,
                quantidade,
                estoque_minimo,
                preco,
                foto,
                produto_id
            )
        )

        banco.commit()

        return jsonify({
            "success": True,
            "message": "Produto atualizado com sucesso"
        })

    except Exception as erro:

        if banco:
            banco.rollback()

        print("ERRO EDITAR PRODUTO:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao editar produto"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()



@app.post("/api/produtos/<int:produto_id>/adicionar")
@login_required
def adicionar_produto(produto_id):

    dados = request.get_json(silent=True) or {}

    quantidade = dados.get("quantidade")

    try:
        quantidade = int(quantidade)
    except (ValueError, TypeError):

        return jsonify({
            "success": False,
            "message": "Quantidade inválida"
        }), 400

    if quantidade <= 0:
        return jsonify({
            "success": False,
            "message": "A quantidade deve ser maior que zero"
        }), 400

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id
            FROM produtos
            WHERE id = %s
            FOR UPDATE
            """,
            (produto_id,)
        )

        produto = cursor.fetchone()

        if not produto:
            return jsonify({
                "success": False,
                "message": "Produto não encontrado"
            }), 404

        cursor.execute(
            """
            UPDATE produtos
            SET quantidade = quantidade + %s
            WHERE id = %s
            """,
            (quantidade, produto_id)
        )

        cursor.execute(
            """
            INSERT INTO movimentacoes
            (produto_id, usuario_id, quantidade, tipo)
            VALUES (%s, %s, %s, 'Entrada')
            """,
            (
                produto_id,
                request.usuario["id"],
                quantidade
            )
        )

        banco.commit()

        return jsonify({
            "success": True,
            "message": "Estoque adicionado com sucesso"
        })

    except Exception as erro:

        if banco:
            banco.rollback()

        print("ERRO ADICIONAR:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao adicionar estoque"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()


@app.post("/api/produtos/<int:produto_id>/retirar")
@login_required
def retirar_produto(produto_id):

    dados = request.get_json(silent=True) or {}

    quantidade = dados.get("quantidade")

    try:
        quantidade = int(quantidade)
    except (ValueError, TypeError):

        return jsonify({
            "success": False,
            "message": "Quantidade inválida"
        }), 400

    if quantidade <= 0:
        return jsonify({
            "success": False,
            "message": "A quantidade deve ser maior que zero"
        }), 400

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, quantidade
            FROM produtos
            WHERE id = %s
            FOR UPDATE
            """,
            (produto_id,)
        )

        produto = cursor.fetchone()

        if not produto:
            return jsonify({
                "success": False,
                "message": "Produto não encontrado"
            }), 404

        if produto["quantidade"] < quantidade:
            return jsonify({
                "success": False,
                "message": "Estoque insuficiente"
            }), 400

        cursor.execute(
            """
            UPDATE produtos
            SET quantidade = quantidade - %s
            WHERE id = %s
            """,
            (quantidade, produto_id)
        )

        cursor.execute(
            """
            INSERT INTO movimentacoes
            (produto_id, usuario_id, quantidade, tipo)
            VALUES (%s, %s, %s, 'Retirada')
            """,
            (
                produto_id,
                request.usuario["id"],
                quantidade
            )
        )

        banco.commit()

        return jsonify({
            "success": True,
            "message": "Produto retirado com sucesso"
        })

    except Exception as erro:

        if banco:
            banco.rollback()

        print("ERRO RETIRAR:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao retirar produto"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()


@app.delete("/api/produtos/<int:produto_id>")
@admin_required
def excluir_produto(produto_id):

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor(dictionary=True)

        cursor.execute(
            "SELECT id FROM produtos WHERE id = %s",
            (produto_id,)
        )

        if not cursor.fetchone():
            return jsonify({
                "success": False,
                "message": "Produto não encontrado"
            }), 404

        # Verifica se existem movimentações
        cursor.execute(
            """
            SELECT COUNT(*) AS total
            FROM movimentacoes
            WHERE produto_id = %s
            """,
            (produto_id,)
        )

        movimentacoes = cursor.fetchone()

        if movimentacoes["total"] > 0:
            return jsonify({
                "success": False,
                "message": "Este produto possui movimentações e não pode ser excluído"
            }), 400

        cursor.execute(
            "DELETE FROM produtos WHERE id = %s",
            (produto_id,)
        )

        banco.commit()

        return jsonify({
            "success": True,
            "message": "Produto excluído com sucesso"
        })

    except Exception as erro:

        if banco:
            banco.rollback()

        print("ERRO EXCLUIR:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao excluir produto"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()


@app.get("/api/movimentacoes")
@login_required
def listar_movimentacoes():

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                m.id,
                m.produto_id,
                p.nome AS produto,
                m.usuario_id,
                u.email AS usuario,
                m.quantidade,
                m.tipo,
                m.data_hora
            FROM movimentacoes m
            INNER JOIN produtos p
                ON p.id = m.produto_id
            INNER JOIN usuario u
                ON u.id = m.usuario_id
            ORDER BY m.data_hora DESC
            """
        )

        movimentacoes = cursor.fetchall()

        return jsonify({
            "success": True,
            "data": movimentacoes
        })

    except Exception as erro:

        print("ERRO MOVIMENTACOES:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao buscar movimentações"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()


@app.get("/api/usuarios")
@admin_required
def listar_usuarios():

    banco = None
    cursor = None

    try:

        banco = conectar()
        cursor = banco.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, email, tipo
            FROM usuario
            ORDER BY id DESC
            """
        )

        usuarios = cursor.fetchall()

        return jsonify({
            "success": True,
            "data": usuarios
        })

    except Exception as erro:

        print("ERRO USUARIOS:", erro)

        return jsonify({
            "success": False,
            "message": "Erro ao buscar usuários"
        }), 500

    finally:

        if cursor:
            cursor.close()

        if banco and banco.is_connected():
            banco.close()


if __name__ == "__main__":

    print("======================================")
    print(" ALMOXARIFADO - API FLASK")
    print("======================================")
    print(f"Banco: {DB_HOST}:{DB_PORT}/{DB_NAME}")
    print("Servidor: http://0.0.0.0:5000")
    print("======================================")

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )