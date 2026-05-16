import { Link, Route, Routes } from "react-router-dom";

import { WalletConnect } from "./components/WalletConnect";
import { useWallet } from "./hooks/useWallet";
import { useWalletBalances } from "./hooks/useWalletBalances";
import { CreateMarketPage } from "./pages/CreateMarketPage";
import { MarketDetailPage } from "./pages/MarketDetailPage";
import { MarketListPage } from "./pages/MarketListPage";

const App = () => {
  const wallet = useWallet();
  const connectedApi =
    wallet.status.kind === "connected"
      ? wallet.status.connection.connected
      : null;

  const { balances, isLoading, refresh } = useWalletBalances(connectedApi);

  return (
    <div className="app">
      <header className="app__bar">
        <Link to="/" className="app__brand">
          cocoa.monster
        </Link>
        <WalletConnect
          status={wallet.status}
          balances={balances}
          isLoadingBalances={isLoading}
          onConnect={wallet.connect}
          onDisconnect={wallet.disconnect}
          onRefreshBalances={refresh}
        />
      </header>
      <main className="app__main">
        <Routes>
          <Route path="/" element={<MarketListPage />} />
          <Route path="/create" element={<CreateMarketPage />} />
          <Route path="/m/:address" element={<MarketDetailPage />} />
        </Routes>
      </main>
      <footer className="app__footer">
        <small>
          Privacy-first prediction markets on Midnight. Sweet name, sharp odds.
        </small>
      </footer>
    </div>
  );
};

export default App;
