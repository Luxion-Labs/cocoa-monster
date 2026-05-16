import { Link, Route, Routes } from "react-router-dom";

import { WalletConnect } from "./components/WalletConnect";
import { useWallet } from "./hooks/useWallet";
import { CreateMarketPage } from "./pages/CreateMarketPage";
import { MarketDetailPage } from "./pages/MarketDetailPage";
import { MarketListPage } from "./pages/MarketListPage";
import { ShieldNightPage } from "./pages/ShieldNightPage";

const App = () => {
  const wallet = useWallet();

  return (
    <div className="app">
      <header className="app__bar">
        <Link to="/" className="app__brand">
          cocoa.monster
        </Link>
        <WalletConnect
          status={wallet.status}
          onConnect={wallet.connect}
          onDisconnect={wallet.disconnect}
        />
      </header>
      <main className="app__main">
        <Routes>
          <Route path="/" element={<MarketListPage />} />
          <Route path="/create" element={<CreateMarketPage />} />
          <Route path="/m/:address" element={<MarketDetailPage />} />
          <Route path="/__shield" element={<ShieldNightPage />} />
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
