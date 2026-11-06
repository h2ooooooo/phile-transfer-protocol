import {ref} from 'vue';

export type ExampleLanguage = 'typescript' | 'javascript' | 'mjs' | 'commonjs';

// Shared across SPA navigation; a new page load starts with TypeScript.
export const exampleLanguage = ref<ExampleLanguage>('typescript');
