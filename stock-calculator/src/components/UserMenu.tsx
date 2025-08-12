import React from 'react';
import { supabase } from '../utils/supabaseClient';
import WbKeyManager from './WbKeyManager';

const UserMenu: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [email, setEmail] = React.useState<string>('');

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const e = data.user?.email || '';
      setEmail(e);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email || '');
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const initials = email ? email[0]?.toUpperCase() : 'U';

  return (
    <div className="ml-auto relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100"
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center text-sm font-semibold">
          {initials}
        </div>
        <span className="hidden sm:block text-sm text-gray-700">{email || 'Гость'}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white shadow-lg rounded-lg border border-gray-200 z-50">
          <button
            onClick={() => { setSettingsOpen(true); setOpen(false); }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
          >
            Настройки пользователя
          </button>
          <div className="border-t" />
          <button
            onClick={handleSignOut}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Выйти
          </button>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSettingsOpen(false)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Настройки пользователя</h3>
              <button onClick={() => setSettingsOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Ключ Wildberries API</h4>
                <WbKeyManager />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;


