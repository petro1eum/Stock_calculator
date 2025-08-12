import React, { useState } from 'react';
import { supabase } from './utils/supabaseClient';

const Login: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useMagic, setUseMagic] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    let errorObj = null as any;
    if (useMagic) {
      const { error } = await supabase.auth.signInWithOtp({ email });
      errorObj = error;
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      errorObj = error;
    }
    setLoading(false);
    if (errorObj) {
      setError(errorObj.message);
    } else {
      onLogin();
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) setError(error.message);
    else setError('Проверьте почту для подтверждения регистрации.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-semibold mb-4 text-center">Вход</h1>
        <p className="text-xs text-gray-500 text-center mb-3">
          Доступ ограничен. Если ваш email не в списке разрешённых — вход будет отклонён.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full border rounded px-3 py-2"/>
          </div>
          {!useMagic && (
          <div>
            <label className="block text-sm text-gray-700 mb-1">Пароль</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full border rounded px-3 py-2"/>
          </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Отправляем…' : useMagic ? 'Войти по ссылке' : 'Войти'}
          </button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={handleSignUp} className="text-blue-600 hover:underline">Зарегистрироваться</button>
            <button type="button" onClick={() => setUseMagic(v => !v)} className="text-gray-600 hover:underline">
              {useMagic ? 'Вход по паролю' : 'Вход по ссылке на email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;


