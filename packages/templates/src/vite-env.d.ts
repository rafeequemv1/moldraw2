/// <reference types="vite/client" />

declare module '*.mol?raw' {
  const content: string;
  export default content;
}
