'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Edit2, Clock, CheckCircle, AlertCircle, Phone, X, MessageCircle, ArrowRight, Check, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

interface Reminder {
    _id: string;
    phone: string;
    title: string;
    message: string;
    reminderTime: string;
    followUpMessage: string;
    followUpTime: string;

    isActive: boolean;
    dailyStatus: 'pending' | 'sent' | 'replied' | 'missed' | 'failed' | 'completed';
    replyText?: string;
    lastSentAt?: string;
    followUpSent?: boolean;
}


export default function Dashboard() {
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        phone: '',
        title: '',
        message: '',
        reminderTime: '08:00',
        followUpMessage: 'Did you complete your habit?',
        followUpTime: '09:00',
    });
    const [submitting, setSubmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Stats
    const stats = {
        total: reminders.length,
        active: reminders.filter(r => r.isActive).length,
        completed: reminders.filter(r => r.dailyStatus === 'completed' || r.dailyStatus === 'replied').length,
    };

    const fetchReminders = async () => {
        try {
            setRefreshing(true);
            const res = await fetch('/api/reminders');
            if (res.ok) {
                const data = await res.json();
                setReminders(data);
                setLastUpdated(new Date());
            }
        } catch (error) {
            console.error('Error fetching reminders');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleManualRefresh = () => {
        fetchReminders();
    };

    useEffect(() => {
        fetchReminders();
        // Auto refresh every 10 seconds to see status updates faster
        const interval = setInterval(fetchReminders, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this reminder?')) return;

        // Optimistic update
        setReminders(reminders.filter(r => r._id !== id));

        await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
        fetchReminders(); // Re-sync
    };

    const handleToggleActive = async (reminder: Reminder) => {
        // Optimistic
        const updated = { ...reminder, isActive: !reminder.isActive };
        setReminders(reminders.map(r => r._id === reminder._id ? updated : r));

        await fetch(`/api/reminders/${reminder._id}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: !reminder.isActive }),
        });
        fetchReminders();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch('/api/reminders', {
                method: 'POST',
                body: JSON.stringify(formData),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                setShowModal(false);
                setFormData({
                    phone: '',
                    title: '',
                    message: '',
                    reminderTime: '08:00',
                    followUpMessage: 'Did you complete your habit?',
                    followUpTime: '09:00',
                });
                fetchReminders();
            }
        } catch (err) {
            alert('Failed to create');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 px-4 py-8 font-sans text-gray-900 md:px-8">
            {/* Header */}
            <header className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-cyan-600 inline-block">
                        HabbitVerse Monitor
                    </h1>
                    <div className="mt-1 flex items-center gap-3">
                        <p className="text-gray-500">One-time reminders with smart follow-up tracking.</p>
                        {lastUpdated && (
                            <span className="text-xs text-gray-400">
                                Last updated: {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex gap-6 text-sm text-gray-500 mr-4">
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-gray-900 text-lg">{stats.total}</span>
                            <span>Total</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-green-600 text-lg">{stats.active}</span>
                            <span>Active</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-indigo-600 text-lg">{stats.completed}</span>
                            <span>Completed</span>
                        </div>
                    </div>
                    <button
                        onClick={handleManualRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
                        title="Refresh status"
                    >
                        <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-500"
                    >
                        <Plus size={18} /> New Reminder
                    </button>
                </div>
            </header>

            {/* Grid */}
            {loading ? (
                <div className="flex justify-center p-20 text-indigo-500 animate-pulse">Loading reminders...</div>
            ) : reminders.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
                    <p className="text-gray-400">No reminders found.</p>
                    <p className="text-xs text-gray-400 mt-2">Each reminder executes once with smart follow-up</p>
                    <button onClick={() => setShowModal(true)} className="mt-4 text-indigo-500 hover:text-indigo-600 font-medium">Create your first reminder</button>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                    {reminders.map((reminder) => (
                        <div key={reminder._id} className={clsx(
                            "group relative flex flex-col justify-between rounded-xl border p-6 transition-all hover:shadow-lg bg-white",
                            reminder.isActive ? "border-gray-200" : "border-gray-200 opacity-60 bg-gray-50"
                        )}>
                            {/* Top Row */}
                            <div className="mb-6 flex items-start justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-lg font-bold text-gray-900">{reminder.title}</h3>
                                        {!reminder.isActive && (
                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-200 text-gray-600 uppercase">Executed</span>
                                        )}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                                        <Phone size={14} className="text-gray-400" />
                                        <span>{reminder.phone}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleToggleActive(reminder)}
                                    className={clsx(
                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                                        reminder.isActive ? 'bg-indigo-600' : 'bg-gray-300'
                                    )}
                                    title="Toggle Active Status"
                                >
                                    <span className={clsx(
                                        "inline-block h-4 w-4 transform rounded-full bg-white transition",
                                        reminder.isActive ? 'translate-x-6' : 'translate-x-1'
                                    )} />
                                </button>
                            </div>

                            {/* Line Map / Status Viz */}
                            <div className="mb-6">
                                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Live Tracking</div>
                                <div className="relative flex items-center justify-between">
                                    {/* Connecting Line */}
                                    <div className="absolute top-3 left-0 w-full h-0.5 bg-gray-100 -z-10"></div>
                                    <div className={clsx("absolute top-3 left-0 h-0.5 transition-all bg-indigo-500 -z-10",
                                        reminder.dailyStatus === 'completed' ? "w-full" :
                                            reminder.dailyStatus === 'sent' || reminder.dailyStatus === 'replied' ? "w-1/2" : "w-0"
                                    )}></div>

                                    {/* Step 1: Scheduled */}
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center border-2 border-white shadow-sm">
                                            <Clock size={12} />
                                        </div>
                                        <span className="text-xs font-medium text-gray-500">{reminder.reminderTime}</span>
                                    </div>

                                    {/* Step 2: Sent */}
                                    <div className="flex flex-col items-center gap-2">
                                        <div className={clsx(
                                            "h-6 w-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-colors",
                                            reminder.dailyStatus !== 'pending' ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-400"
                                        )}>
                                            <Check size={12} />
                                        </div>
                                        <span className={clsx("text-xs font-medium", reminder.dailyStatus !== 'pending' ? "text-indigo-600" : "text-gray-400")}>
                                            Sent
                                        </span>
                                    </div>

                                    {/* Step 3: Action */}
                                    <div className="flex flex-col items-center gap-2">
                                        <div className={clsx(
                                            "h-6 w-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-colors",
                                            reminder.dailyStatus === 'completed' ? "bg-green-500 text-white" :
                                                reminder.dailyStatus === 'replied' ? "bg-blue-500 text-white" :
                                                    "bg-gray-200 text-gray-400"
                                        )}>
                                            {reminder.dailyStatus === 'completed' ? <CheckCircle size={12} /> :
                                                reminder.dailyStatus === 'replied' ? <MessageCircle size={12} /> :
                                                    <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                                        </div>
                                        <span className={clsx("text-xs font-medium",
                                            reminder.dailyStatus === 'completed' ? "text-green-600" :
                                                reminder.dailyStatus === 'replied' ? "text-blue-600" : "text-gray-400")}>
                                            {reminder.dailyStatus === 'completed' ? 'Done' : 'Reply'}
                                        </span>
                                    </div>

                                    {/* Step 4: Follow-up */}
                                    <div className="flex flex-col items-center gap-2">
                                        <div className={clsx(
                                            "h-6 w-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-colors",
                                            reminder.followUpSent ? "bg-amber-500 text-white" :
                                                (reminder.dailyStatus === 'completed' || reminder.dailyStatus === 'replied') ? "bg-gray-100 text-gray-300" : // Cancelled/Skipped
                                                    "bg-gray-200 text-gray-400"
                                        )}>
                                            <AlertCircle size={12} />
                                        </div>
                                        <span className="text-xs font-medium text-gray-400">
                                            {reminder.followUpTime}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                                <div className="flex gap-2">
                                    <div className={clsx(
                                        "px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide",
                                        reminder.dailyStatus === 'completed' ? "bg-green-100 text-green-700" :
                                            reminder.dailyStatus === 'replied' ? "bg-blue-100 text-blue-700" :
                                                reminder.dailyStatus === 'sent' ? "bg-indigo-100 text-indigo-700" :
                                                    "bg-gray-100 text-gray-500"
                                    )}>
                                        {reminder.dailyStatus}
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleDelete(reminder._id)}
                                    className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-red-600 transition-colors"
                                >
                                    <Trash2 size={14} /> Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-900">New One-Time Reminder</h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                                    <input type="text" required placeholder="Morning Yoga"
                                        className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                                        value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Time (24h)</label>
                                    <input type="time" required
                                        className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                                        value={formData.reminderTime} onChange={e => setFormData({ ...formData, reminderTime: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                                <input type="text" required placeholder="e.g. 9876543210"
                                    className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                                    value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                                <p className="mt-1 text-xs text-gray-500">10-digit mobile number (India)</p>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Reminder Message</label>
                                <textarea required rows={2} placeholder="Time to do your habit!"
                                    className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                                    value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })}
                                />
                                <p className="mt-1 text-xs text-gray-500">⚡ This will be sent once at the scheduled time</p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Follow-up Message</label>
                                    <input type="text" required
                                        className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                                        value={formData.followUpMessage} onChange={e => setFormData({ ...formData, followUpMessage: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Follow-up Time</label>
                                    <input type="time" required
                                        className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                                        value={formData.followUpTime} onChange={e => setFormData({ ...formData, followUpTime: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="mt-6 border-t border-gray-100 pt-4">
                                <div className="mb-3 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700">
                                    <strong>ℹ️ How it works:</strong> This reminder will execute <strong>once</strong> at the scheduled time. If no reply is received, a follow-up will be sent. You can create multiple reminders as needed.
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="mt-4 w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 hover:shadow-indigo-500/30 transition-all disabled:opacity-50"
                            >
                                {submitting ? 'Creating...' : '✨ Create One-Time Reminder'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
