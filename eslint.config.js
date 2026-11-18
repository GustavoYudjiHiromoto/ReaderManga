import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**', 'server.js', 'node_modules/**']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
