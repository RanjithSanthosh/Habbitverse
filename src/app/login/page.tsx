'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (res.ok) {
                router.push('/dashboard');
            } else {
                const data = await res.json();
                setError(data.error || 'Login failed');
            }
        } catch {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 font-sans text-gray-100">
            <div className="w-full max-w-md rounded-2xl bg-gray-900/50 p-8 shadow-2xl backdrop-blur-xl border border-gray-800">
                <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">Welcome Back</h1>
                <p className="mb-8 text-gray-400">Sign in to manage habit reminders.</p>

                {error && (
                    <div className="mb-4 rounded-lg bg-red-900/30 p-4 text-sm text-red-400 border border-red-900/50">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-300">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full rounded-lg bg-gray-950 border border-gray-800 px-4 py-3 text-white transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder="admin"
                            required
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-300">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-lg bg-gray-950 border border-gray-800 px-4 py-3 text-white transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition-all hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>

                    <p className="text-center text-xs text-gray-500">
                        Secure Admin Portal
                    </p>
                </form>
            </div>
        </div>
    );
}
