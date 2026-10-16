#!/usr/bin/env bash
# Instala o que NÃO está pinado em package.json. Motivo: o ambiente que gerou este repositório não tinha
# rede, então não pude confirmar versões dessas bibliotecas. `expo install` escolhe as compatíveis com o
# SDK 57; as demais o npm resolve. DEPOIS: commite package-lock.json (é ele que torna o build reproduzível).
set -euo pipefail
cd "$(dirname "$0")/.."

npm install                       # dependências pinadas em package.json (expo 57, RN 0.86.3, React 19.2.3 ...)

npx expo install react-native-safe-area-context react-native-screens react-native-webview
npm install @react-navigation/native @react-navigation/native-stack zustand @supabase/supabase-js react-native-url-polyfill

npx expo install --dev jest-expo
npm install --save-dev jest @types/jest typescript @types/react typescript-eslint eslint eslint-plugin-react-hooks prettier

npx expo install --check          # confirma/ajusta versões ao SDK
echo "Agora: npm run verify && git add package-lock.json"
