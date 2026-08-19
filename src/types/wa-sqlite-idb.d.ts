declare module 'wa-sqlite/src/examples/IDBMinimalVFS.js' {
  export class IDBMinimalVFS {
    constructor(idbDatabaseName: string, options?: Record<string, unknown>);
    readonly name: string;
    close(): Promise<void>;
  }
}