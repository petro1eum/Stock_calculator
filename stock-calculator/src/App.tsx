import React from 'react';
import './App.css';
import InventoryOptionCalculator from './InventoryCalculator';
import { PortfolioSettingsProvider } from './contexts/PortfolioSettingsContext';
import { supabase } from './utils/supabaseClient';
import Login from './Login';
import { isUserAllowed } from './utils/authGate';

function App() {
  const [session, setSession] = React.useState<any>(null);

  React.useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    };
    init();
  }, []);

  if (!session || !isUserAllowed(session)) {
    return <Login onLogin={async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
    }} />;
  }

  return (
    <div className="App">
      <PortfolioSettingsProvider>
        <InventoryOptionCalculator />
      </PortfolioSettingsProvider>
    </div>
  );
}

export default App;
