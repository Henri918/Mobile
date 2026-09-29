# Almoxarifado Mobile — versão simples

Projeto React Native + Expo feito propositalmente com uma estrutura pequena e fácil de entender.

## Rodar

```powershell
cd mobile
npm install
```

Crie `mobile/.env` a partir de `.env.example` e coloque o IP do PC:

```env
EXPO_PUBLIC_API_URL=http://192.168.0.10:5000/api
```

Depois:

```powershell
npx.cmd expo start --lan
```

O celular e o PC precisam estar na mesma rede.

## Estrutura

```text
mobile/
├── App.tsx
├── package.json
├── app.json
├── index.js
├── tsconfig.json
└── .env.example
```

Toda a interface está em `App.tsx` para facilitar apresentação, estudo e manutenção por um aluno.
