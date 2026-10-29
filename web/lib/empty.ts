// Stand-in for optional x402 payment packages that @coinbase/cdp-sdk (pulled in by RainbowKit's Base Account
// connector) references but that aren't installed. This app never calls them; each export throws if it ever is.
const unavailable = (name: string) =>
  function () {
    throw new Error(`${name} is not available in this app`);
  };

export const x402Client = unavailable("x402Client");
export const toClientEvmSigner = unavailable("toClientEvmSigner");
export const registerExactEvmScheme = unavailable("registerExactEvmScheme");
export const ExactEvmScheme = unavailable("ExactEvmScheme");
export const UptoEvmScheme = unavailable("UptoEvmScheme");
export const ExactSvmScheme = unavailable("ExactSvmScheme");
export const registerExactSvmScheme = unavailable("registerExactSvmScheme");
