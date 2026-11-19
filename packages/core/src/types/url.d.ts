/**
 * The WHATWG `URL`, which everywhere this runs has: the browser's page and extension, and Node. Declared here for what
 * `catalogue-relay.ts` reads of it, as this package leaves out web globals.
 */
declare const URL: {
  new (url: string): {
    readonly href: string;
    readonly origin: string;
    readonly pathname: string;
    readonly username: string;
    readonly password: string;
    readonly hash: string;
  };
  canParse(url: string): boolean;
};
