import { NATIVE_MINT, type Cluster } from "./solana";

/** USD market cap a coin starts at, and where its curve completes and graduates to DAMM v2. */
export const START_MCAP_USD = 2_500;
export const GRADUATION_MCAP_USD = 30_000;

export type QuoteCategory = "solana" | "currency" | "xstock" | "backpack" | "prestock" | "tessera";

export const quoteCategories: Record<QuoteCategory, string> = {
  solana: "Solana",
  currency: "Stablecoins",
  xstock: "xStocks",
  backpack: "Backpack stocks",
  prestock: "PreStocks",
  tessera: "Tessera",
};

export type QuoteSpec = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  category: QuoteCategory;
  /** Official token logo (from the issuer, via Jupiter token metadata). */
  logo: string;
  /** Reference USD price (Oct 2026), used only when live prices are unavailable. */
  refUsd: number;
};

/**
 * Every quote asset a coin can launch against: the pairs stonk.fun offers (SOL, stablecoins, xStocks, Backpack
 * stocks, PreStocks, Tessera). Each gets its own Meteora DBC config, created on first use at the quote's live USD
 * price, so every coin starts at START_MCAP_USD and graduates at GRADUATION_MCAP_USD whatever it is paired with.
 * Decimals are re-read from the mint when the config is created. Token-2022 quotes need a DBC token badge from
 * Meteora; the backend marks a quote unavailable if its config is rejected.
 *
 * [symbol, name, mint, decimals, category, logo, refUsd], mainnet.
 */
const mainnet: [string, string, string, number, QuoteCategory, string, number][] = [
  ["SOL","Wrapped SOL","So11111111111111111111111111111111111111112",9,"solana","https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",100.285],
  ["USDC","USDC","EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",6,"currency","https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",0.99946],
  ["USDT","USDT","Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",6,"currency","https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",0.998448],
  ["EURC","EURC","HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",6,"currency","https://www.circle.com/eurc-icon",1.11306],
  ["ONYC","ONYC","5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5",9,"currency","https://arweave.net/PyZzfGP-CqzaVlxTU3sb-I5uv4ZZKwnY8aCjcWn9S1A",1.1572],
  ["JLUSDC","JLUSDC","9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D",6,"currency","https://cdn.instadapp.io/solana/tokens/icons/usdc.png",1.06631],
  ["SPYX","SP500","XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/SPYx.png",770.048],
  ["NVDAX","NVIDIA","Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/NVDAx.png",213.828],
  ["GOOGLX","GOOGLE","XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/GOOGLx.png",291.769],
  ["QQQX","QQQ","Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/QQQx.png",717.471],
  ["TSLAX","TESLA","XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/TSLAx.png",401.575],
  ["CRCLX","CIRCLE","XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/CRCLx.png",79.6167],
  ["COINX","COIN","Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/COINx.png",157.846],
  ["MSTRX","MICROSTRATEGY","XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/MSTRx.png",141.55],
  ["AMZNX","AMAZON","Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/AMZNx.png",251.712],
  ["HOODX","HOOD","XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/HOODx.png",89.9516],
  ["SPCXX","SPACEX","Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/SPCXx.png",143.947],
  ["APPLX","APPLE","XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png",347.306],
  ["GLDX","GOLD","Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/GLDx.png",368.847],
  ["METAX","META","Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/METAx.png",619.637],
  ["PLTRX","PLTR","XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/PLTRx.png",197.879],
  ["MSFTX","MSFT","XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/MSFTx.png",550.464],
  ["GMEX","GME","Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/GMEx.png",23.4068],
  ["STRCX","STRCX","Xs78JED6PFZxWc2wCEPspZW9kL3Se5J7L5TChKgsidH",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/STRCx.png",99.7642],
  ["MCDX","MCDX","XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/MCDx.png",252.55],
  ["BRKX","BRKX","Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/BRK.Bx.png",543.98],
  ["KOX","COCA COLA","XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/KOx.png",92.7892],
  ["INTCX","INTC","XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/INTCx.png",91.7045],
  ["VIDAX","VIDAX","XsfCC9VL4DamVGNgdJpfLXB3sBVa158Gbx8sh7NzmTk",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/VIDAx.png",1.09288],
  ["DFDV","DFDV","Xs2yquAgsHByNzx68WJC55WHjHBvG9JsMB7CWjTLyPy",8,"xstock","https://xstocks-metadata.backed.fi/logos/tokens/DFDVx.png",3.79872],
  ["MU","Micron","MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1",6,"backpack","https://backpack.exchange/api/stock-logo/MU?cacheburst=1",949.583],
  ["ROBOSTRATEGY","BOT","BoTx8y9ynfdxf5ZjWtCoBVkff52qKA82ysaLU8ZM6d8T",6,"backpack","https://backpack.exchange/api/stock-logo/BOT",23.2479],
  ["SKHY","SKHYNIX","SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3",6,"backpack","https://backpack.exchange/api/stock-logo/SKHY",161.113],
  ["SNDK","SANDISK","SNDKbwMUQvZhnLnxLduradgLHG5KrPuKwpnrkkGRhfH",6,"backpack","https://backpack.exchange/api/stock-logo/SNDK",1358.15],
  ["DRAM","DRAM","DRAMjSWR7HRfJKjRkvQWYL2bcaejaVhuxEcjf4pAY4Cw",6,"backpack","https://backpack.exchange/api/stock-logo/DRAM",52.0121],
  ["TTWO","TTWO","TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo",6,"backpack","https://backpack.exchange/api/stock-logo/TTWO",196.98],
  ["NBIS","NBIS","NBiSF3UaVUFtRzHwAfxyHsBCAZWGEKnMpewAE4oh7BG",6,"backpack","https://backpack.exchange/api/stock-logo/NBIS",170.736],
  ["MRNA","MODERNA","MRNAzXzhNcaEXJPibHEn8cd4vyekCDiivTyEwswLUCT",6,"backpack","https://backpack.exchange/api/stock-logo/MRNA",215.64],
  ["LLY","LLY","LLYuwZ33keFihgwoxXsBawy31AiRFLFSva32TYq5TvD",6,"backpack","https://backpack.exchange/api/stock-logo/LLY",1308.41],
  ["MRVL","MRVL","MRVLSjkR2ceUBukujaD3xCyHP1H3B2SzpsNTZF546jo",6,"backpack","https://backpack.exchange/api/stock-logo/MRVL",226.104],
  ["GPRO","GPRO","GPRR2u6NS5yBQHWGauoJ9HXgjrTH8dDsrBfTV5zAYvDH",6,"backpack","https://backpack.exchange/api/stock-logo/GPRO",1.01044],
  ["AMC","AMC","AMC1qwR9KhiyrQBRPrxnfo4JfMeMZqEBvt5tgTytNNoc",6,"backpack","https://metadata.backpack.exchange/stock-images/backpack_securities.png",3.00021],
  ["NIKE","NIKE","NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg",6,"backpack","https://backpack.exchange/api/stock-logo/NKE",37.54],
  ["SPHR","SPHR","SPHRp8cZaSQBTp1KMNP4V1X821SXhXWt4Q2yLdyHzju",6,"backpack","https://backpack.exchange/api/stock-logo/SPHR",111.337],
  ["HTZ","Hertz","HTZsLG4zqaNvWMwXSLHH3GG5KyJpKwpBRsKVdMG6hvzP",6,"backpack","https://backpack.exchange/api/stock-logo/HTZ",1.91752],
  ["RDDT","RDDT","RDDTGbhHwVXfyCvQMXzzowKjf5qrYBZAnehoXW83ooh",6,"backpack","https://backpack.exchange/api/stock-logo/RDDT",131.896],
  ["COST","COST","CZEB3WNZuF2Yz1z2H81RcCk8T7fsw82KB33zqamASVsg",6,"backpack","https://backpack.exchange/api/stock-logo/COST",990.05],
  ["DELL","DELL","DELL2aRKQz7DMq5DrKLtkn47ZCnbxXPZXrSGbkmd13wy",6,"backpack","https://backpack.exchange/api/stock-logo/DELL",483.02],
  ["DJT","DJT","DJTu7vi8norVzdVAffgvb39VP7wjKeTsgaMBJrzfxvoF",6,"backpack","https://backpack.exchange/api/stock-logo/DJT",5.92334],
  ["IBM","IBM","BMKdM4yUxX12moFqVk195k7coMbaybd4RUKCUdm7D1Sk",6,"backpack","https://backpack.exchange/api/stock-logo/IBM",250.384],
  ["LMT","LMT","LMT3i1BHgixFqPUgcyteJhnEz2dpy9i3cYy4pi9BoeV",6,"backpack","https://backpack.exchange/api/stock-logo/LMT",637.261],
  ["QUBT","QUBT","QUBTAD8C9bMU9LvmMNgKPhrmBGbHvxpu6vfWQtThxxw",6,"backpack","https://backpack.exchange/api/stock-logo/QUBT",6.77892],
  ["RBLX","RBLX","RBLXDGRD64AtRamHMFVcjqne3Ar7NLWtFtYNtsrf1cE",6,"backpack","https://backpack.exchange/api/stock-logo/RBLX",53.5543],
  ["HIMS","HIMS","HiMSSzzwkZkrXJ4PGVJRdtfLaANeAztjjcgk5Dxe7Lwx",6,"backpack","https://backpack.exchange/api/stock-logo/HIMS",29.0469],
  ["LULU","LULU","LULUmT9VMttkfAJE236LXJcYJ2tTP7nunrSWR5G1BdS",6,"backpack","https://backpack.exchange/api/stock-logo/LULU",105.427],
  ["PFIZER","PFIZER","PFER6ENqP8r8NF3CqVt4mFowxsin3V5MLidBNQFCC3x",6,"backpack","https://backpack.exchange/api/stock-logo/PFE",29.5662],
  ["RIVN","RIVN","RcZmt84VMJv9bDhKqmw1uWDahYrUT468VwAChTnfD8p",6,"backpack","https://backpack.exchange/api/stock-logo/RIVN",12.2063],
  ["SHOP","SHOP","SH55hfaipFAbwT42nQYhRoM5o5t61QpkmJ6p62vXB3m",6,"backpack","https://backpack.exchange/api/stock-logo/SHOP",168.484],
  ["SNAP","SNAP","SNAPcESrvnH8yUdgeMF6xm1hym9b6hW6s8YeqeHdZFz",6,"backpack","https://backpack.exchange/api/stock-logo/SNAP",5.90438],
  ["UPS","UPS","UPSqUeMHcWbkdg784XuBUEF9DtySSnW9ur5LAVdcuB9",6,"backpack","https://backpack.exchange/api/stock-logo/UPS",105.795],
  ["PENG","PENG","PENGTDQeQSXEjKcYw3CTQi9qznxcTHXAA7LMfUNrxLV",6,"backpack","https://backpack.exchange/api/stock-logo/PENG",0],
  ["BOEING","BOEING","BArimz1PcKZr8PcPh3tcZ2dg4S7FJLk3cw6R5F8GsHKg",6,"backpack","https://backpack.exchange/api/stock-logo/BA",168.158],
  ["AMBA","AMBA","AMBAHqGPjjtJaHPPSuvPu2mPCJdkGZpmhHQa5pkXbxrM",6,"backpack","https://backpack.exchange/api/stock-logo/AMBA",0],
  ["WEBULL","WEBULL","BULL151gUXcFV5wXEUqu9Am2L7Qt4bTJRLRuAUjkcspC",6,"backpack","https://backpack.exchange/api/stock-logo/BULL",5.48505],
  ["JNJ","JNJ","JNJg1znKdF712Phe7L7z52AATAvEjEytBdN2w8Lnh1Y",6,"backpack","https://backpack.exchange/api/stock-logo/JNJ",273.438],
  ["BABA","BABA","BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp",6,"backpack","https://backpack.exchange/api/stock-logo/BABA",98.7485],
  ["GRND","GRND","GRNDYDpqwpCm6jVxpbh4xT5AM4r3p391qYsKTHqgaET2",6,"backpack","https://backpack.exchange/api/stock-logo/GRND",12.9082],
  ["MGM","MGM","MGMuubtUEirmkhfEQdmGUh4pr7HuUdMWcZXFtpPbVJD",6,"backpack","https://backpack.exchange/api/stock-logo/MGM",27.1793],
  ["DNUT","DNUT","DNUTsCvKbKwu2RM72cUuW3TD9YpzArzACcqYQssjPLSk",6,"backpack","https://backpack.exchange/api/stock-logo/DNUT",2.96919],
  ["WEN","WEN","WENAZ2WyPbmgvUcKfQ8hyMDfBQP9bZ65hsZ5KTFrRGZ",6,"backpack","https://backpack.exchange/api/stock-logo/WEN",6.98407],
  ["DKNG","DKNG","DKNGQFNGQmoBdXSRGKJ8tTu7uPDasw5JDcfMmWniNfow",6,"backpack","https://backpack.exchange/api/stock-logo/DKNG",20.3952],
  ["FLWS","FLWS","FLWSojG1gB5VStYR3Sb4nQFRt43UBYkqih1j2CpVLqgd",6,"backpack","https://backpack.exchange/api/stock-logo/FLWS",2.9422],
  ["SCHH","SCHH","SCHHJ3jRdSjeFEVAaLrnYdx3Brphn92Ys7z1qkiCtPX",6,"backpack","https://backpack.exchange/api/stock-logo/SCHH",22.5524],
  ["PTN","PTN","PTNzAfFAB4LvoUQEUUGrFMyUoRLExMYjH6CcfyQfsVP",6,"backpack","https://backpack.exchange/api/stock-logo/PTN",5.08952],
  ["FLY","FLY","FLYRq3en8r2Z69gN3KyAnDrvnitEJNkwPYY7favinHeD",6,"backpack","https://backpack.exchange/api/stock-logo/FLY",19.6687],
  ["BROS","Dutch Bros","BRVaZKg6J9iF2BEsdpsxJ9NyvN9PPxPZuoQUX2v8qqkk",6,"backpack","https://backpack.exchange/api/stock-logo/BROS",42.9314],
  ["AMD","Advanced Micro Devices","AMD8XwJXgQ9WV45Wyj9yFLejxzf2J6VM1PJY8bJEjeES",6,"backpack","https://backpack.exchange/api/stock-logo/AMD",560.317],
  ["FWDI","Forward Industries","FWDtiB5fXHdVAewPqvHPL2dh4aBC1C6GacQbePoQXKjz",6,"backpack","https://backpack.exchange/api/stock-logo/FWDI",6.87618],
  ["LUV","Southwest Airlines","LUV9GB51PNZNRyzzyYK3rtqFfvDvWtRiXZ34wVq2HrX",6,"backpack","https://backpack.exchange/api/stock-logo/LUV",43.7805],
  ["WULF","TeraWulf","WULFeyfrj1VJKD9HhRTcW8R4g5HefUA11HDEdBv2WxD",6,"backpack","https://backpack.exchange/api/stock-logo/WULF",12.9231],
  ["RUM","Rumble","RUMsPfFZFnN1ZmGANwP7FNMJMjKH4m9RiMePrtVtLe7",6,"backpack","https://backpack.exchange/api/stock-logo/RUM",5.81794],
  ["USO","United States Oil Fund","USNv3NkKA27Dh4nsHJDPhW4VoEcTQmjoZyJt2dqdwFu",6,"backpack","https://backpack.exchange/api/stock-logo/USO",164.859],
  ["CYPH","CYPH","CYPHuMmCL1GxJWa2tsPhLKykC7GrHJTCHwbXD4g5uawK",6,"backpack","https://backpack.exchange/api/stock-logo/CYPH",2.98375],
  ["BB","BlackBerry","BBosJLw8ZzoATiEyywiifx7AgmrD2Cm3XjFWbhbRhChy",6,"backpack","https://backpack.exchange/api/stock-logo/BB",9.10633],
  ["URA","Global X Uranium ETF","URARfsinxCRw4JpvQhuT4CxavdZXZEMjv9ZwWmWpwag",6,"backpack","https://backpack.exchange/api/stock-logo/URA",35.787],
  ["COPX","Global X Copper Miners ETF","CzLTZppPdZtTjyq3WGpHLstoc3GLhu7zH5Zg6xUa6Gv5",6,"backpack","https://backpack.exchange/api/stock-logo/COPX",76.2623],
  ["IONQ","IonQ","NQ5hSuXQZrbnrwcDVk2qN73njjd3E3v3badYHnj5thF",6,"backpack","https://backpack.exchange/api/stock-logo/IONQ",31.9283],
  ["ARM","Arm Holdings","ARMbSB1MBRQrY6PNMao1HdQ431VafC6JRJCsGZ2Yv3iJ",6,"backpack","https://backpack.exchange/api/stock-logo/ARM",225.59],
  ["CRWV","CoreWeave","CRWVJeR2yEZuDUKYfGuKCHvLz8ywn4LGvovHfy5WiFmi",6,"backpack","https://backpack.exchange/api/stock-logo/CRWV",60.3123],
  ["IREN","IREN","RENzhrJQgmAnfcLhU1U5XwAMc6TC15UA6jCbPBaasnj",6,"backpack","https://backpack.exchange/api/stock-logo/IREN",27.7629],
  ["SQQQ","ProShares UltraPro Short QQQ","SQQQAa3gUxgnqcEsdjPA4RQNQBgB97TnG2hJhk2WaGE",6,"backpack","https://backpack.exchange/api/stock-logo/SQQQ",37.4645],
  ["EWY","iShares MSCI South Korea ETF","EWY4owSJYMpwN33qGDu5gGxpkQkpMJu8ZUsQJaNZG5dv",6,"backpack","https://backpack.exchange/api/stock-logo/EWY",160.717],
  ["NOK","Nokia","N7Q5fYX7YRnDQksfdBKnoUb3awm92n7QNAD35X3Rq1X",6,"backpack","https://backpack.exchange/api/stock-logo/NOK",9.24217],
  ["RKLB","Rocket Lab","RKLBnAXGqv31iZomqsuAWkQm1aqC7JwwvbCfzGdqAhz",6,"backpack","https://backpack.exchange/api/stock-logo/RKLB",57.3817],
  ["NFLX","Netflix","NFLX7qV57zuVxCoHy3s1jiGZyALraLNwttbxdvmYJLJ",6,"backpack","https://backpack.exchange/api/stock-logo/NFLX",62.2616],
  ["BE","Bloom Energy","BEBVfXZ8uCxRBuunEbW9wcq9r7W9ySNo14oJBJkDgpZx",6,"backpack","https://backpack.exchange/api/stock-logo/BE",219.122],
  ["PUSA","PUSA","PUSAG1stksTcAoK9MjinEHUwAYRJsbovywYCk37m6hy",6,"backpack","https://backpack.exchange/api/stock-logo/PUSA",1.79227],
  ["BLK","BlackRock","BLKKYfF41c6xRPrtX1rdYbxLE1xxEdZUnxQsB5hcZ8Nf",6,"backpack","https://backpack.exchange/api/stock-logo/BLK",1142.12],
  ["EWZ","iShares MSCI Brazil ETF","EWZzCki1igp2y73UyUM4RCG4QUVMQAtnrQUVNaDHzDxJ",6,"backpack","https://backpack.exchange/api/stock-logo/EWZ",32.859],
  ["CBRS","Cerebras Systems","CBRSFBbQPpp77NpMcwbTN6fhBHmZM94oFLJvruytw4Fi",6,"backpack","https://backpack.exchange/api/stock-logo/CBRS",108.141],
  ["RACE","Ferrari","RACEyWiM2ztEZcJx2AHXU2eWjhxU57x3vXn92b39dLD",6,"backpack","https://backpack.exchange/api/stock-logo/RACE",393.319],
  ["RIOT","Riot Platforms","RUKx7nBgm94pwRPbVm99xYVdcTDTUyGs8Cw3VSYQXHf",6,"backpack","https://backpack.exchange/api/stock-logo/RIOT",13.927],
  ["CMG","Chipotle","CMGi497VQA9RiHVWpQi5B847vN8RLaEwcMhB5kEUhkAQ",6,"backpack","https://backpack.exchange/api/stock-logo/CMG",30.6322],
  ["TSM","Taiwan Semiconductor","TSM2Hiuf7Z9REcwZFQvsBEekBYCYziWBABfFnj6V6gQ",6,"backpack","https://backpack.exchange/api/stock-logo/TSM",422.667],
  ["AVGO","Broadcom","AVGoo4BQGsEfAmu4HU2deZTaTmLoqB3q3EzKXqAANGYD",6,"backpack","https://backpack.exchange/api/stock-logo/AVGO",340.162],
  ["UVXY","ProShares Ultra VIX Short-Term Futures","UVXY4ojmAMTaPwUmrRmcuxWHjMHCbz3BxX2RBMzjYKx",6,"backpack","https://backpack.exchange/api/stock-logo/UVXY",17.3984],
  ["CHWY","Chewy","CHWYHz2zfKajomqPV9it26n7vu7AgZZfqGHXCWtGWuJg",6,"backpack","https://backpack.exchange/api/stock-logo/CHWY",20.7211],
  ["ABNB","Airbnb","ABNB56TteaTZG1S3DY2W8VMncQmHMvNCGaZgAba49CLP",6,"backpack","https://backpack.exchange/api/stock-logo/ABNB",164.662],
  ["TSLA","Tesla","TSLAqBbv4CNCnzWFeB7LmydAyEiNMJtve7DYKLpdK4S",6,"backpack","https://backpack.exchange/api/stock-logo/TSLA",401.873],
  ["META","Meta Platforms","METAaH6MMZZgy2CTEJq3QdNi7AFVTV3NxHFBfFgLEDd",6,"backpack","https://backpack.exchange/api/stock-logo/META",619.965],
  ["AMZN","Amazon","AMZNw7cwU9L9c7ewZXxTws2PwQYxBGm2Rxg3FLDBJz9B",6,"backpack","https://backpack.exchange/api/stock-logo/AMZN",251.1],
  ["NVDA","Nvidia","NVDAVuiB7hwd3m5Wa1JuHNovPaPG6BH1QNztbKFxNjv",6,"backpack","https://backpack.exchange/api/stock-logo/NVDA",214.248],
  ["AAPL","Apple","AAPLEDt8RpzPgXyhvFzkMBofvFSQw9gpeMCoUdPdLnB8",6,"backpack","https://backpack.exchange/api/stock-logo/AAPL",346.66],
  ["GOOGL","Alphabet","GooGLMvZtJZXHdNZy95RUrAMCCKxV6ghK3qE5ddBgVm5",6,"backpack","https://backpack.exchange/api/stock-logo/GOOGL",292.273],
  ["MSFT","Microsoft","MSFThX899B1DddH5jkyMpdArWXzP85VXLYDrbGGcRJM",6,"backpack","https://backpack.exchange/api/stock-logo/MSFT",549.096],
  ["CAKE","The Cheesecake Factory","CAKEcebDN4vqwAHBgj4ApzBvYCXsLWdsqCfFHNfW6Rui",6,"backpack","https://backpack.exchange/api/stock-logo/CAKE",103.705],
  ["ANTHROPIC","ANTHROPIC","Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw",9,"prestock","https://www.prestocks.com/logos/anthropic.png?cachebust=1",1001.19],
  ["ANDURIL","ANDURIL","PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB",9,"prestock","https://www.prestocks.com/logos/anduril.png?cachebust=1",162.065],
  ["POLYMARKET","POLYMARKET","Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP",9,"prestock","https://www.prestocks.com/logos/polymarket.png?cachebust=1",140.023],
  ["KALSHI","KALSHI","PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua",9,"prestock","https://www.prestocks.com/logos/kalshi.png?cachebust=1",883.676],
  ["NEURALINK","NEURALINK","PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S",9,"prestock","https://www.prestocks.com/logos/neuralink.png?cachebust=1",406.125],
  ["OPENAI","OPENAI","PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",9,"prestock","https://www.prestocks.com/logos/openai.png?cachebust=1",1491.22],
  ["FIGUREAI","FIGUREAI","PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd",9,"prestock","https://www.prestocks.com/logos/figureai.png?cachebust=1",169.984],
  ["OURA","Oura","Pre9atBqkocK1QngFy7Q7zvyQictEFpXdLi6bZ2qnYy",9,"prestock","https://www.prestocks.com/logos/oura.png?cachebust=1",71.2922],
  ["OPENAI","OPENAI (Tessera)","oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ",9,"tessera","https://cdn.tesseralab.co/tessera/tokenicon_T-OpenAI.svg",1500.67],
  ["KALSHI","KALSHI (Tessera)","TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ",9,"tessera","https://cdn.tesseralab.co/tessera/tokenicon_T-Kalshi.svg",445.993],
];

const spec = ([symbol, name, mint, decimals, category, logo, refUsd]: (typeof mainnet)[number]): QuoteSpec => ({
  symbol,
  name,
  mint,
  decimals,
  category,
  logo,
  refUsd,
});
const sol = spec(mainnet.find((q) => q[2] === NATIVE_MINT)!);
const usdc = spec(mainnet.find((q) => q[0] === "USDC")!);

export const quoteCatalog: Record<Cluster, QuoteSpec[]> = {
  "mainnet-beta": mainnet.map(spec),
  devnet: [sol, { ...usdc, name: "USDC (devnet)", mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" }],
};
