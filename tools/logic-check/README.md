# logic-check — verificação de LÓGICA sem Jest

**Isto não é Jest e não substitui `npm test`.** É um shim mínimo (`jestshim.cjs`) sobre `node:test` + `node:assert` que reimplementa só os matchers usados nos testes (`toBe`, `toEqual`, `toThrow`, `toBeNull`, `toContain`, `toBeCloseTo`, `toBeGreaterThanOrEqual`, `.not`). Existe porque o ambiente que escreveu o código não tinha rede para instalar o Jest.

```bash
npm run logic-check       # tsc (strict) nos módulos puros + execução dos testes compilados
```

- Cobre **apenas** módulos sem dependência de React Native/Expo/Supabase: `src/domain`, `src/utils`, `src/security`, `src/config/parseConfig`, `src/services/captcha`.
- Requer `typescript` instalado (`npm install` + passos do README-SETUP-WINDOWS) e Node ≥ 22.
- Última execução registrada (ambiente Linux, TypeScript 6.0, Node 22.22): 101 testes, 101 passaram — com uma **configuração de tsconfig diferente** da deste diretório (`module: node16` foi escolhido aqui por compatibilidade e **só foi verificado neste empacotamento**, ver MANIFEST). Na sua máquina o resultado pode diferir: **registre o que acontecer**.
