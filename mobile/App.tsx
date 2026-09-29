import React, {useEffect, useState} from 'react';
import {Alert, ActivityIndicator, FlatList, Image, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

type User={id:number;email:string;tipo:'admin'|'usuario'};
type Product={id:number;nome:string;categoria:string;quantidade:number;quantidade_estoque?:number;estoque_minimo:number;preco:number;foto2?:string};
type Movement={id:number;produto_id:number;produto:string;tipo:string;quantidade:number;usuario:string;data_hora:string};


async function request(path:string, options:any={}, token?:string){
  const headers:any={'Content-Type':'application/json',...(options.headers||{})};
  if(token) headers.Authorization=`Bearer ${token}`;
  const res=await fetch(`${API}${path}`,{...options,headers});
  let body:any={}; try{body=await res.json()}catch{}
  if(!res.ok) throw new Error(body.message||'Não foi possível concluir a operação.');
  return body.data;
}

export default function App(){
  const [token,setToken]=useState(''); const [user,setUser]=useState<User|null>(null); const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{const t=await AsyncStorage.getItem('token');const u=await AsyncStorage.getItem('user');if(t&&u){setToken(t);setUser(JSON.parse(u))}setLoading(false)})()},[]);
  async function login(email:string,senha:string){const data=await request('/auth/login',{method:'POST',body:JSON.stringify({email,senha})});await AsyncStorage.multiSet([['token',data.token],['user',JSON.stringify(data.user)]]);setToken(data.token);setUser(data.user)}
  async function logout(){await AsyncStorage.multiRemove(['token','user']);setToken('');setUser(null)}
  if(loading)return <Loading/>;
  if(!token||!user)return <Login onLogin={login}/>;
  return <Main user={user} token={token} logout={logout}/>;
}

function Loading(){return <View style={s.center}><ActivityIndicator size="large" color="#1769e0"/></View>}

function Login({onLogin}:{onLogin:(e:string,p:string)=>Promise<void>}){
  const [email,setEmail]=useState('');const [senha,setSenha]=useState('');const [busy,setBusy]=useState(false);
  async function go(){if(!email||!senha)return Alert.alert('Atenção','Informe e-mail e senha.');setBusy(true);try{await onLogin(email.trim(),senha)}catch(e:any){Alert.alert('Não foi possível entrar',e.message)}finally{setBusy(false)}}
  return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content"/><View style={s.login}>
    <View style={s.logo}><Text style={s.logoText}>A</Text></View><Text style={s.title}>Almoxarifado</Text><Text style={s.subtitle}>Controle de estoque</Text>
    <View style={s.form}><Text style={s.label}>E-mail</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="seu@email.com" style={s.input}/>
    <Text style={s.label}>Senha</Text><TextInput value={senha} onChangeText={setSenha} secureTextEntry placeholder="••••••••" style={s.input}/>
    <Button text={busy?'Entrando...':'Entrar'} onPress={go} disabled={busy}/></View>
  </View></SafeAreaView>
}

function Main({user,token,logout}:{user:User;token:string;logout:()=>Promise<void>}){
  const [tab,setTab]=useState<'inicio'|'produtos'|'mov'|'usuarios'>('inicio');
  const [products,setProducts]=useState<Product[]>([]); const [movs,setMovs]=useState<Movement[]>([]); const [users,setUsers]=useState<User[]>([]); const [busy,setBusy]=useState(false);
  async function load(){setBusy(true);try{const p=await request('/produtos',{},token);setProducts(p);if(tab==='mov')setMovs(await request('/movimentacoes',{},token));if(user.tipo==='admin'&&tab==='usuarios')setUsers(await request('/usuarios',{},token))}catch(e:any){Alert.alert('Erro',e.message)}finally{setBusy(false)}}
  useEffect(()=>{load()},[tab]);
  const low=products.filter(p=>p.quantidade<=p.estoque_minimo&&p.estoque_minimo>0).length;
  return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content"/><View style={s.header}><View><Text style={s.small}>Olá,</Text><Text style={s.headerTitle}>{user.email}</Text></View><Pressable onPress={()=>Alert.alert('Sair','Deseja sair?', [{text:'Cancelar'},{text:'Sair',style:'destructive',onPress:logout}])}><Text style={s.logout}>Sair</Text></Pressable></View>
    <View style={s.body}>{tab==='inicio'?<Home products={products} low={low} onProducts={()=>setTab('produtos')}/>:tab==='produtos'?<Products products={products} token={token} admin={user.tipo==='admin'} reload={load}/>:tab==='mov'?<Movements movs={movs}/>:<Users users={users}/>}</View>
    <View style={s.tabs}><Tab label="Início" active={tab==='inicio'} onPress={()=>setTab('inicio')}/><Tab label="Produtos" active={tab==='produtos'} onPress={()=>setTab('produtos')}/><Tab label="Movimentos" active={tab==='mov'} onPress={()=>setTab('mov')}/>{user.tipo==='admin'&&<Tab label="Usuários" active={tab==='usuarios'} onPress={()=>setTab('usuarios')}/>}</View>
    {busy&&<View style={s.loadingBar}><ActivityIndicator color="#fff"/></View>}
  </SafeAreaView>
}

function Home({products,low,onProducts}:{products:Product[];low:number;onProducts:()=>void}){return <FlatList data={[]} ListHeaderComponent={<View><Text style={s.pageTitle}>Visão geral</Text><Text style={s.pageSub}>Resumo do estoque atual.</Text><View style={s.cards}><Card title="Produtos" value={String(products.length)}/><Card title="Estoque baixo" value={String(low)} danger={low>0}/></View><Pressable style={s.primary} onPress={onProducts}><Text style={s.primaryText}>Ver produtos</Text></Pressable><View style={s.section}><Text style={s.sectionTitle}>Acesso rápido</Text><Text style={s.muted}>Use a aba Produtos para adicionar ou retirar itens do estoque.</Text></View></View>} contentContainerStyle={s.content}/>}
function Card({title,value,danger}:{title:string;value:string;danger?:boolean}){return <View style={[s.card,danger&&s.cardDanger]}><Text style={s.cardTitle}>{title}</Text><Text style={s.cardValue}>{value}</Text></View>}

function Products({products,token,admin,reload}:{products:Product[];token:string;admin:boolean;reload:()=>void}){const [search,setSearch]=useState('');const [selected,setSelected]=useState<Product|null>(null);const list=products.filter(p=>p.nome.toLowerCase().includes(search.toLowerCase())||p.categoria.toLowerCase().includes(search.toLowerCase()));
  if(selected)return <ProductDetail p={selected} token={token} admin={admin} back={()=>{setSelected(null);reload()}}/>;
  return <View style={s.flex}><Text style={s.pageTitle}>Produtos</Text><TextInput value={search} onChangeText={setSearch} placeholder="Pesquisar produto..." style={s.input}/><FlatList data={list} keyExtractor={x=>String(x.id)} contentContainerStyle={{paddingTop:10,paddingBottom:30}} ListEmptyComponent={<Empty/>} renderItem={({item})=><Pressable style={s.product} onPress={()=>setSelected(item)}><View style={s.productIcon}><Text>📦</Text></View><View style={{flex:1}}><Text style={s.productName}>{item.nome}</Text><Text style={s.productCat}>{item.categoria}</Text></View><View><Text style={s.qty}>{item.quantidade}</Text><Text style={s.productCat}>un.</Text></View></Pressable>}/></View>}

function ProductDetail({p,token,admin,back}:{p:Product;token:string;admin:boolean;back:()=>void}){const [q,setQ]=useState('1');const [busy,setBusy]=useState(false);async function action(type:'add'|'remove'|'delete'){const n=Number(q);if(type!=='delete'&&(!Number.isInteger(n)||n<=0))return Alert.alert('Atenção','Digite uma quantidade válida.');setBusy(true);try{if(type==='add')await request(`/produtos/${p.id}/adicionar`,{method:'POST',body:JSON.stringify({quantidade:n})},token);if(type==='remove')await request(`/produtos/${p.id}/retirar`,{method:'POST',body:JSON.stringify({quantidade:n})},token);if(type==='delete')await request(`/produtos/${p.id}`,{method:'DELETE'},token);Alert.alert('Sucesso',type==='delete'?'Produto excluído.':'Estoque atualizado.');back()}catch(e:any){Alert.alert('Não foi possível concluir',e.message)}finally{setBusy(false)}}return <View style={s.flex}><Pressable onPress={back}><Text style={s.back}>‹ Voltar</Text></Pressable><Text style={s.pageTitle}>{p.nome}</Text><Text style={s.pageSub}>{p.categoria}</Text><View style={s.detailCard}><Text style={s.detailLabel}>Estoque atual</Text><Text style={s.detailValue}>{p.quantidade}</Text>{p.estoque_minimo>0&&<Text style={s.muted}>Mínimo: {p.estoque_minimo}</Text>}</View><Text style={s.label}>Quantidade</Text><TextInput value={q} onChangeText={setQ} keyboardType="number-pad" style={s.input}/><View style={s.row}><Button text="Adicionar" onPress={()=>action('add')} disabled={busy}/><Button text="Retirar" onPress={()=>action('remove')} disabled={busy} secondary/></View>{admin&&<Pressable style={s.delete} onPress={()=>Alert.alert('Excluir produto?','Esta ação não pode ser desfeita.',[{text:'Cancelar'},{text:'Excluir',style:'destructive',onPress:()=>action('delete')}])}><Text style={s.deleteText}>Excluir produto</Text></Pressable>}</View>}

function Movements({movs}:{movs:Movement[]}){return <View style={s.flex}><Text style={s.pageTitle}>Movimentações</Text><FlatList data={movs} keyExtractor={x=>String(x.id)} contentContainerStyle={{paddingTop:10,paddingBottom:30}} ListEmptyComponent={<Empty/>} renderItem={({item})=><View style={s.movement}><View style={{flex:1}}><Text style={s.productName}>{item.produto}</Text><Text style={s.productCat}>{item.tipo} • {item.usuario}</Text></View><Text style={s.qty}>{item.quantidade}</Text></View>}/></View>}
function Users({users}:{users:User[]}){return <View style={s.flex}><Text style={s.pageTitle}>Usuários</Text><FlatList data={users} keyExtractor={x=>String(x.id)} contentContainerStyle={{paddingTop:10}} renderItem={({item})=><View style={s.movement}><View style={{flex:1}}><Text style={s.productName}>{item.email}</Text><Text style={s.productCat}>ID {item.id}</Text></View><Text style={s.badge}>{item.tipo}</Text></View>}/></View>}
function Empty(){return <View style={s.empty}><Text style={s.muted}>Nenhum item encontrado.</Text></View>}
function Button({text,onPress,disabled,secondary}:{text:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}){return <Pressable disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.buttonSecondary,disabled&&{opacity:.5}]}><Text style={[s.buttonText,secondary&&s.buttonTextSecondary]}>{text}</Text></Pressable>}
function Tab({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={s.tab}><Text style={[s.tabText,active&&s.tabActive]}>{label}</Text></Pressable>}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#f6f8fc'},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#f6f8fc'},login:{flex:1,justifyContent:'center',padding:28},logo:{width:64,height:64,borderRadius:18,backgroundColor:'#1769e0',alignItems:'center',justifyContent:'center',marginBottom:18},logoText:{fontSize:32,fontWeight:'800',color:'#fff'},title:{fontSize:30,fontWeight:'800',color:'#152238'},subtitle:{fontSize:15,color:'#718096',marginTop:5,marginBottom:30},form:{gap:10},label:{fontSize:13,fontWeight:'700',color:'#344054',marginTop:8},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e1e6ef',borderRadius:12,paddingHorizontal:14,paddingVertical:13,fontSize:15,color:'#172033'},button:{flex:1,backgroundColor:'#1769e0',padding:14,borderRadius:12,alignItems:'center',marginTop:12},buttonText:{color:'#fff',fontWeight:'800'},buttonSecondary:{backgroundColor:'#e9eff9'},buttonTextSecondary:{color:'#1769e0'},header:{padding:18,paddingBottom:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},small:{fontSize:12,color:'#8993a4'},headerTitle:{fontSize:16,fontWeight:'700',color:'#172033',marginTop:2},logout:{color:'#d92d20',fontWeight:'700'},body:{flex:1,paddingHorizontal:18},content:{paddingBottom:30},pageTitle:{fontSize:25,fontWeight:'800',color:'#172033',marginTop:8},pageSub:{color:'#7b8494',marginTop:4,marginBottom:18},cards:{flexDirection:'row',gap:12},card:{flex:1,backgroundColor:'#fff',borderRadius:16,padding:18,borderWidth:1,borderColor:'#edf0f5'},cardDanger:{borderColor:'#ffd6d2'},cardTitle:{fontSize:13,color:'#778195'},cardValue:{fontSize:28,fontWeight:'800',color:'#172033',marginTop:8},primary:{backgroundColor:'#1769e0',borderRadius:13,padding:15,alignItems:'center',marginTop:16},primaryText:{color:'#fff',fontWeight:'800'},section:{backgroundColor:'#fff',padding:18,borderRadius:16,marginTop:14},sectionTitle:{fontWeight:'800',fontSize:16,color:'#172033',marginBottom:6},muted:{color:'#7c8799',fontSize:13,lineHeight:19},tabs:{height:68,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#e9edf3',flexDirection:'row',alignItems:'center',justifyContent:'space-around'},tab:{padding:10},tabText:{fontSize:12,color:'#8993a4',fontWeight:'700'},tabActive:{color:'#1769e0'},flex:{flex:1},product:{backgroundColor:'#fff',borderRadius:14,padding:13,marginBottom:9,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#edf0f5'},productIcon:{width:44,height:44,borderRadius:12,backgroundColor:'#eef4ff',alignItems:'center',justifyContent:'center',marginRight:12},productName:{fontSize:15,fontWeight:'750',color:'#172033'},productCat:{fontSize:12,color:'#8993a4',marginTop:3},qty:{fontSize:17,fontWeight:'800',color:'#1769e0',textAlign:'right'},back:{color:'#1769e0',fontWeight:'700',marginBottom:12},detailCard:{backgroundColor:'#fff',borderRadius:18,padding:20,marginVertical:18,borderWidth:1,borderColor:'#edf0f5'},detailLabel:{color:'#7c8799'},detailValue:{fontSize:42,fontWeight:'800',color:'#172033',marginVertical:6},row:{flexDirection:'row',gap:10},delete:{padding:15,alignItems:'center',marginTop:10},deleteText:{color:'#d92d20',fontWeight:'800'},movement:{backgroundColor:'#fff',borderRadius:14,padding:15,marginBottom:9,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#edf0f5'},badge:{fontSize:11,fontWeight:'800',color:'#1769e0',backgroundColor:'#eef4ff',paddingHorizontal:9,paddingVertical:6,borderRadius:8},empty:{padding:30,alignItems:'center'},loadingBar:{position:'absolute',bottom:68,left:0,right:0,height:3,backgroundColor:'#1769e0'}});
