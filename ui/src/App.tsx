import { Link, Route, Routes } from "react-router-dom";

import { WalletConnect } from "./components/WalletConnect";
import { useWallet } from "./hooks/useWallet";
import { CreateMarketPage } from "./pages/CreateMarketPage";
import { FactoryAdminPage } from "./pages/FactoryAdminPage";
import { MarketDetailPage } from "./pages/MarketDetailPage";
import { MarketListPage } from "./pages/MarketListPage";
import { OracleMarketPage } from "./pages/OracleMarketPage";

const App = () => {
  const wallet = useWallet();

  return (
    <div className="app">
      <header className="app__bar">
        <div className="app__left">
          <Link to="/" className="app__brand">
            cocoa.monster
          </Link>
          <nav className="app__nav" aria-label="Primary">
            <Link to="/">Markets</Link>
            <Link to="/create">Create</Link>
            <Link to="/oracle">Oracle</Link>
          </nav>
        </div>
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
          <Route path="/oracle" element={<FactoryAdminPage />} />
          <Route path="/oracle/:address" element={<OracleMarketPage />} />
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
