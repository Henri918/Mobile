import React, {useEffect, useState} from 'react';
import {
  Alert, FlatList, Pressable, SafeAreaView, StyleSheet,
  Text, TextInput, View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

type User = {id:number; email:string; tipo:'admin'|'usuario'};
type Product = {
  id:number; nome:string; categoria:string; quantidade:number;
  estoque_minimo:number; preco:number; foto?:string; foto2?:string;
};
type Movement = {
  id:number; produto_id:number; produto:string; tipo:string;
  quantidade:number; usuario:string; data_hora:string;
};

async function api(path:string, options:any={}, token=''){
  const headers = {'Content-Type':'application/json', ...(options.headers||{})};
  if(token) (headers as any).Authorization = `Bearer ${token}`;

  const r = await fetch(API + path, {...options, headers});
  const b = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(b.message || 'Erro na operação');
  return b.data;
}

export default function App(){
  const [token,setToken] = useState('');
  const [user,setUser] = useState<User|null>(null);

  useEffect(()=>{
    (async()=>{
      const t = await AsyncStorage.getItem('token');
      const u = await AsyncStorage.getItem('user');
      if(t && u){setToken(t);setUser(JSON.parse(u));}
    })();
  },[]);

  async function login(email:string,senha:string){
    const d = await api('/auth/login',{
      method:'POST',body:JSON.stringify({email,senha})
    });
    await AsyncStorage.multiSet([
      ['token',d.token],['user',JSON.stringify(d.user)]
    ]);
    setToken(d.token); setUser(d.user);
  }

  async function sair(){
    await AsyncStorage.multiRemove(['token','user']);
    setToken(''); setUser(null);
  }

  if(!token || !user) return <Login login={login}/>;
  return <Main user={user} token={token} sair={sair}/>;
}

function Login({login}:{login:(e:string,s:string)=>Promise<void>}){
  const [email,setEmail] = useState('');
  const [senha,setSenha] = useState('');

  async function entrar(){
    if(!email || !senha) return Alert.alert('Preencha os campos');
    try{await login(email.trim(),senha);}
    catch(e:any){Alert.alert('Erro',e.message);}
  }

  return (
    <SafeAreaView style={s.tela}>
      <View style={s.caixa}>
        <Text style={s.titulo}>Almoxarifado</Text>

        <Text>E-mail</Text>
        <TextInput style={s.input} value={email} onChangeText={setEmail}/>

        <Text>Senha</Text>
        <TextInput
          style={s.input} value={senha} onChangeText={setSenha}
          secureTextEntry
        />

        <Button title="Entrar" onPress={entrar}/>
      </View>
    </SafeAreaView>
  );
}

function Main({
  user,token,sair
}:{
  user:User; token:string; sair:()=>Promise<void>
}){
  const [page,setPage] = useState('inicio');
  const [products,setProducts] = useState<Product[]>([]);
  const [movs,setMovs] = useState<Movement[]>([]);
  const [users,setUsers] = useState<User[]>([]);

  async function carregar(){
    try{
      setProducts((await api('/produtos',{},token)) || []);
      if(page==='mov') setMovs((await api('/movimentacoes',{},token)) || []);
      if(page==='usuarios' && user.tipo==='admin')
        setUsers((await api('/usuarios',{},token)) || []);
    }catch(e:any){Alert.alert('Erro',e.message);}
  }

  useEffect(()=>{carregar();},[page]);

  return (
    <SafeAreaView style={s.tela}>
      <View style={s.topo}>
        <Text style={s.topotxt}>{user.email}</Text>
        <Pressable onPress={sair}><Text style={s.sair}>Sair</Text></Pressable>
      </View>

      <View style={{flex:1}}>
        {page==='inicio' && <Inicio products={products} mudar={()=>setPage('produtos')}/>}
        {page==='produtos' &&
          <Produtos
            products={products}
            token={token}
            admin={user.tipo==='admin'}
            reload={carregar}
          />
        }
        {page==='mov' && <Movimentos movs={movs}/>}
        {page==='usuarios' && <Usuarios users={users}/>}
      </View>

      <View style={s.menu}>
        <Menu txt="Início" onPress={()=>setPage('inicio')}/>
        <Menu txt="Produtos" onPress={()=>setPage('produtos')}/>
        <Menu txt="Mov." onPress={()=>setPage('mov')}/>
        {user.tipo==='admin' &&
          <Menu txt="Usuários" onPress={()=>setPage('usuarios')}/>}
      </View>
    </SafeAreaView>
  );
}

function Inicio({
  products,mudar
}:{products:Product[];mudar:()=>void}){
  const baixo = products.filter(
    x=>x.estoque_minimo>0 && x.quantidade<=x.estoque_minimo
  ).length;

  return (
    <View style={s.caixa}>
      <Text style={s.titulo}>Início</Text>
      <Text>Produtos: {products.length}</Text>
      <Text style={{marginTop:8}}>Estoque baixo: {baixo}</Text>
      <Button title="Ver produtos" onPress={mudar}/>
    </View>
  );
}

function Produtos({
  products,token,admin,reload
}:{
  products:Product[]; token:string; admin:boolean; reload:()=>void
}){
  const [form,setForm] = useState(false);
  const [edit,setEdit] = useState<Product|null>(null);

  if(form || edit){
    return (
      <ProdutoForm
        token={token}
        produto={edit}
        voltar={()=>{setForm(false);setEdit(null);}}
        reload={reload}
      />
    );
  }

  return (
    <View style={{flex:1,padding:15}}>
      <View style={s.linha}>
        <Text style={s.titulo}>Produtos</Text>
        {admin &&
          <Button title="+ Produto" onPress={()=>setForm(true)}/>}
      </View>

      <FlatList
        data={products}
        keyExtractor={x=>String(x.id)}
        ListEmptyComponent={<Text>Nenhum produto.</Text>}
        renderItem={({item})=>
          <ProdutoItem
            p={item}
            token={token}
            admin={admin}
            editar={()=>setEdit(item)}
            reload={reload}
          />
        }
      />
    </View>
  );
}

function ProdutoItem({
  p,token,admin,editar,reload
}:{
  p:Product; token:string; admin:boolean;
  editar:()=>void; reload:()=>void
}){
  const [q,setQ] = useState('1');

  async function estoque(tipo:'add'|'remove'){
    const n = Number(q);
    if(!Number.isInteger(n) || n<=0)
      return Alert.alert('Digite uma quantidade válida');

    try{
      await api(`/produtos/${p.id}/${tipo==='add'?'adicionar':'retirar'}`,{
        method:'POST',
        body:JSON.stringify({quantidade:n})
      },token);
      setQ('1');
      reload();
    }catch(e:any){Alert.alert('Erro',e.message);}
  }

  async function excluir(){
    try{
      await api(`/produtos/${p.id}`,{method:'DELETE'},token);
      reload();
    }catch(e:any){Alert.alert('Erro',e.message);}
  }

  return (
    <View style={s.item}>
      <Text style={s.nome}>{p.nome}</Text>
      <Text>{p.categoria}</Text>
      <Text>Quantidade: {p.quantidade}</Text>
      <Text>Preço: R$ {Number(p.preco||0).toFixed(2)}</Text>

      <TextInput
        style={s.inputPeq}
        value={q}
        onChangeText={setQ}
        keyboardType="number-pad"
        placeholder="Qtd."
      />

      <View style={s.linha}>
        {admin && <Button title="+" onPress={()=>estoque('add')}/>}
        <Button title="Retirar" onPress={()=>estoque('remove')}/>
        {admin && <Button title="Editar" onPress={editar}/>}
        {admin && <Button title="Excluir" onPress={()=>
          Alert.alert('Excluir?','',[
            {text:'Não'},
            {text:'Sim',style:'destructive',onPress:excluir}
          ])
        }/>}
      </View>
    </View>
  );
}

function ProdutoForm({
  token,produto,voltar,reload
}:{
  token:string; produto:Product|null;
  voltar:()=>void; reload:()=>void
}){
  const [nome,setNome] = useState(produto?.nome || '');
  const [categoria,setCategoria] = useState(produto?.categoria || '');
  const [qtd,setQtd] = useState(String(produto?.quantidade ?? 0));
  const [min,setMin] = useState(String(produto?.estoque_minimo ?? 0));
  const [preco,setPreco] = useState(String(produto?.preco ?? 0));
  const [foto,setFoto] = useState(produto?.foto || produto?.foto2 || '');

  async function salvar(){
    if(!nome || !categoria) return Alert.alert('Preencha nome e categoria');

    const dados = {
      nome,
      categoria,
      quantidade:Number(qtd),
      estoque_minimo:Number(min),
      preco:Number(preco.replace(',','.')),
      foto:foto || null
    };

    try{
      await api(
        produto ? `/produtos/${produto.id}` : '/produtos',
        {method:produto?'PUT':'POST',body:JSON.stringify(dados)},
        token
      );
      Alert.alert('OK',produto?'Produto editado':'Produto adicionado');
      reload();
      voltar();
    }catch(e:any){Alert.alert('Erro',e.message);}
  }

  return (
    <View style={{padding:15}}>
      <Button title="Voltar" onPress={voltar}/>
      <Text style={s.titulo}>
        {produto?'Editar produto':'Novo produto'}
      </Text>

      <Text>Nome</Text>
      <TextInput style={s.input} value={nome} onChangeText={setNome}/>

      <Text>Categoria</Text>
      <TextInput style={s.input} value={categoria} onChangeText={setCategoria}/>

      <Text>Quantidade</Text>
      <TextInput style={s.input} value={qtd} onChangeText={setQtd} keyboardType="number-pad"/>

      <Text>Estoque mínimo</Text>
      <TextInput style={s.input} value={min} onChangeText={setMin} keyboardType="number-pad"/>

      <Text>Preço</Text>
      <TextInput style={s.input} value={preco} onChangeText={setPreco} keyboardType="decimal-pad"/>

      <Text>Foto (opcional)</Text>
      <TextInput style={s.input} value={foto} onChangeText={setFoto}/>

      <Button title="Salvar" onPress={salvar}/>
    </View>
  );
}

function Movimentos({movs}:{movs:Movement[]}){
  return (
    <View style={{flex:1,padding:15}}>
      <Text style={s.titulo}>Movimentações</Text>

      <FlatList
        data={movs}
        keyExtractor={x=>String(x.id)}
        ListEmptyComponent={<Text>Nenhuma movimentação.</Text>}
        renderItem={({item})=>
          <View style={s.item}>
            <Text style={s.nome}>{item.produto}</Text>
            <Text>Tipo: {item.tipo}</Text>
            <Text>Quantidade: {item.quantidade}</Text>
            <Text>Usuário: {item.usuario}</Text>
            <Text>{item.data_hora}</Text>
          </View>
        }
      />
    </View>
  );
}

function Usuarios({users}:{users:User[]}){
  return (
    <View style={{flex:1,padding:15}}>
      <Text style={s.titulo}>Usuários</Text>

      <FlatList
        data={users}
        keyExtractor={x=>String(x.id)}
        renderItem={({item})=>
          <View style={s.item}>
            <Text>{item.email}</Text>
            <Text>Tipo: {item.tipo}</Text>
          </View>
        }
      />
    </View>
  );
}

function Button({
  title,onPress
}:{title:string;onPress:()=>void}){
  return (
    <Pressable onPress={onPress} style={s.botao}>
      <Text style={s.botaoTxt}>{title}</Text>
    </Pressable>
  );
}

function Menu({
  txt,onPress
}:{txt:string;onPress:()=>void}){
  return (
    <Pressable onPress={onPress} style={s.menuBtn}>
      <Text>{txt}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tela:{flex:1,backgroundColor:'#f2f2f2'},
  caixa:{padding:20},
  topo:{padding:15,backgroundColor:'#fff',flexDirection:'row',justifyContent:'space-between'},
  topotxt:{fontWeight:'bold'},
  sair:{color:'red',fontWeight:'bold'},
  titulo:{fontSize:24,fontWeight:'bold',marginBottom:15},
  input:{borderWidth:1,borderColor:'#bbb',backgroundColor:'#fff',padding:10,marginBottom:10,borderRadius:5},
  inputPeq:{borderWidth:1,borderColor:'#bbb',backgroundColor:'#fff',padding:8,width:80,marginVertical:8},
  botao:{backgroundColor:'#1769e0',padding:10,borderRadius:5,margin:4},
  botaoTxt:{color:'#fff',fontWeight:'bold'},
  item:{backgroundColor:'#fff',padding:15,marginBottom:10,borderRadius:5},
  nome:{fontSize:18,fontWeight:'bold',marginBottom:5},
  linha:{flexDirection:'row',alignItems:'center',flexWrap:'wrap'},
  menu:{height:55,backgroundColor:'#fff',flexDirection:'row',justifyContent:'space-around',alignItems:'center',borderTopWidth:1,borderColor:'#ccc'},
  menuBtn:{padding:8}
});
