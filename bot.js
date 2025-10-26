import WebSocket from "ws";
import Decimal from "decimal.js";

const ASSET = "SOL";
//https://docs.pyth.network/price-feeds/core/price-feeds/price-feed-ids for price feed ids
const PYTH_ID =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

const WS_URL = "wss://hermes.pyth.network/ws";
const ws = new WebSocket(WS_URL); //creates a new websocket connection to Pyth

//NOTE: CANDLESTICK_DURATION and CANDLESTICK_INTERVAL should match each other
const CANDLESTICK_DURATION = 1000 * 1; //milliseconds (1000 * X = X seconds)
//https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints refer for intervals for binance api
const CANDLESTICK_INTERVAL = "1s"; //for the binance api
const SYMBOL = "SOLUSDT"; //for the binance api
const CANDLESTICK_WINDOW_SIZE = 20; //how many candlesticks to keep track of

class Candle {
  constructor(timestamp, open, high, low, close) {
    this.timestamp = timestamp; //note timestamp is the open time of the candle
    this.open = open;
    this.high = high;
    this.low = low;
    this.close = close;
  }
  //for easier printing
  toString() {
    return `${this.timestamp} - ${this.open.toFixed(4)} - ${this.high.toFixed(
      4
    )} - ${this.low.toFixed(4)} - ${this.close.toFixed(4)}`;
  }
}
//array of historical candles
const candles = [];

//async to wait for historical candles
ws.onopen = async () => {
  console.log("Connected to Pyth Websocket");
  //wait to fetch historical candles before continuing
  const startTime = Date.now() - CANDLESTICK_DURATION * CANDLESTICK_WINDOW_SIZE;
  const endTime = Date.now();
  console.log(
    `Fetching historical candles for ${SYMBOL} at ${CANDLESTICK_INTERVAL} interval from ${startTime} to ${endTime}`
  );
  await fetchHistoricalCandles(
    startTime,
    endTime,
    SYMBOL,
    CANDLESTICK_INTERVAL
  );
  console.log(`Fetched ${candles.length} candles`);
  //when historical candles are fetched, subscribe to price updates for the asset
  console.log(`Subscribing to ${ASSET} price updates...`);
  ws.send(
    JSON.stringify({
      type: "subscribe",
      ids: [PYTH_ID],
    })
  );
  console.log(`Subscribed to ${ASSET} price updates`);
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type !== "price_update") return;

  const { price, confidence, timestamp } = parsePrice(data.price_feed);
  //   console.log(
  //     `${ASSET} price: ${price} confidence: ${confidence} timestamp: ${timestamp}`
  //   );
  updateCandles(price, timestamp);
};

function parsePrice(price_feed) {
  const price = new Decimal(price_feed.price.price);
  const confidence = new Decimal(price_feed.price.conf);
  const exponent = new Decimal(price_feed.price.expo);
  const timestamp = new Date(price_feed.price.publish_time * 1000);
  const actual_price = price.times(Math.pow(10, exponent.toNumber()));
  const actual_confidence = confidence.times(Math.pow(10, exponent.toNumber()));
  return { price: actual_price, confidence: actual_confidence, timestamp };
}

//gets historical candles from binance
async function fetchHistoricalCandles(
  startTime,
  endTime,
  symbol,
  candleStickInterval
) {
  const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${candleStickInterval}&startTime=${startTime}&endTime=${endTime}&limit=1000`;
  const response = await fetch(binanceUrl);
  const klines = await response.json();
  for (const kline of klines) {
    const timestamp = parseInt(kline[0], 10); // openTime
    const open = parseFloat(kline[1]);
    const high = parseFloat(kline[2]);
    const low = parseFloat(kline[3]);
    const close = parseFloat(kline[4]);
    const candle = new Candle(timestamp, open, high, low, close);
    //can change logic here to do whatever we want with the candle data
    candles.push(candle);
  }
  console.log("Candles: \nTimestamp - Open - High - Low - Close");
  console.log(candles.map((candle) => candle.toString()).join("\n"));
}

function updateCandles(price, timestamp) {
  if (candles.length === 0) return;
  const numericPrice = price.toNumber(); //change decimal to number
  //fetch the current candle, the last one in the list
  const currentCandle = candles[candles.length - 1];
  //calculate the time at which the current candle should close
  const currentCandleEndTimestamp =
    currentCandle.timestamp + CANDLESTICK_DURATION;
  //if the current price is within the current candles time, then update current candle
  if (timestamp < currentCandleEndTimestamp) {
    //if current price is a new high/low, update high/low
    currentCandle.high = Math.max(currentCandle.high, numericPrice);
    currentCandle.low = Math.min(currentCandle.low, numericPrice);
    //overright the close price of the current candle
    currentCandle.close = numericPrice;
    console.log(`Updated current candle: ${currentCandle.toString()}`);
  } else {
    //if the current time is outside the current candle, then create a new candle
    const newTimestamp = currentCandleEndTimestamp; //start the new candle at the end of the current candle
    //create a new candle with this timestamp and all OHLC set to the current price initially
    const newCandle = new Candle(
      newTimestamp,
      numericPrice,
      numericPrice,
      numericPrice,
      numericPrice
    );
    //add the new candle to the list
    candles.push(newCandle);
    console.log(`Added new candle: ${newCandle.toString()}`);

    //need to check if adding the new candle has made the list too long
    if (candles.length > CANDLESTICK_WINDOW_SIZE) {
      //if the list is too long, remove the oldest candle
      candles.shift();
    }
  }
}
