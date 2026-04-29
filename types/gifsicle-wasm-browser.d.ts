declare module 'gifsicle-wasm-browser' {
  interface GifsicleInput {
    file: File | Blob | ArrayBuffer | string;
    name: string;
  }
  interface GifsicleOptions {
    input: GifsicleInput[];
    command: string[];
    folder?: string[];
    isStrict?: boolean;
  }
  interface GifsicleInstance {
    run(options: GifsicleOptions): Promise<File[]>;
  }
  const gifsicle: GifsicleInstance;
  export default gifsicle;
}
