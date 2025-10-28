import pandas as pd
from backtesting import Backtest, Strategy

df = pd.read_csv('sol_hourly_data.csv', parse_dates=True, index_col=0)

class BollingerRSIStrategy(Strategy):
    bb_period = 20
    bb_std = 2
    rsi_period = 14
    rsi_lower = 30
    rsi_upper = 70


    def init(self):
        close = pd.Series(self.data.Close, index=self.data.index)
        sma = close.rolling(window=self.bb_period).mean()
        std = close.rolling(window=self.bb_period).std()

        # Pre-compute the Series and pass them as lambda functions
        bb_upper_data = sma + (std * self.bb_std)
        bb_lower_data = sma - (std * self.bb_std)
        
        self.bb_upper = self.I(lambda: bb_upper_data, name='BB_Upper')
        self.bb_middle = self.I(lambda: sma, name='BB_Middle')
        self.bb_lower = self.I(lambda: bb_lower_data, name='BB_Lower')
        
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=self.rsi_period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=self.rsi_period).mean()
        rs = gain / loss
        rsi_data = 100 - (100 / (1 + rs))
        self.rsi = self.I(lambda: rsi_data, name='RSI')

    def next(self):
        price = self.data.Close[-1] #get the most recent price
        #skip if indicators are not ready
        if pd.isna(self.rsi[-1]) or pd.isna(self.bb_lower[-1]):
            return
    
        # Buy when price is at/above upper BB and RSI is high (breakout momentum)
        if price >= self.bb_upper[-1] and self.rsi[-1] > self.rsi_upper:
            #if price goes above, and we are still long, close and short
            self.position.close()
        # Sell when price is at/below lower BB and RSI is low (support breakdown)
        elif price <= self.bb_lower[-1] and self.rsi[-1] < self.rsi_lower:  
            #if price goes below, and we are still short, close and buy
            self.buy(sl=0.95*price)#stop loss at 5% below entry price



bt = Backtest(df, BollingerRSIStrategy, cash=10000, exclusive_orders=True)
stats = bt.run()
print(stats)

bt.plot()

