'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Edit2, Clock, CheckCircle, AlertCircle, Phone, X } from 'lucide-react';
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
    dailyStatus: 'pending' | 'sent' | 'replied' | 'missed' | 'failed';
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

    // Stats
    const stats = {
        total: reminders.length,
        active: reminders.filter(r => r.isActive).length,
        replied: reminders.filter(r => r.dailyStatus === 'replied').length,
    };

    const fetchReminders = async () => {
        try {
            const res = await fetch('/api/reminders');
            if (res.ok) {
                const data = await res.json();
                setReminders(data);
            }
        } catch (error) {
            console.error('Error fetching reminders');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReminders();
        // Auto refresh every minute to see status updates
        const interval = setInterval(fetchReminders, 60000);
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
        <div className="min-h-screen bg-gray-950 px-4 py-8 font-sans text-gray-100 md:px-8">
            {/* Header */}
            <header className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400 inline-block">
                        HabbitVerse Admin
                    </h1>
                    <p className="mt-1 text-gray-400">Manage automated habit reminders and schedules.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex gap-4 text-sm text-gray-400 mr-4">
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-white text-lg">{stats.total}</span>
                            <span>Total</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-green-400 text-lg">{stats.active}</span>
                            <span>Active</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="font-bold text-indigo-400 text-lg">{stats.replied}</span>
                            <span>Replied Today</span>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500"
                    >
                        <Plus size={18} /> New Reminder
                    </button>
                </div>
            </header>

            {/* Grid */}
            {loading ? (
                <div className="flex justify-center p-20 text-indigo-400 animate-pulse">Loading reminders...</div>
            ) : reminders.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 bg-gray-900/50">
                    <p className="text-gray-500">No reminders found.</p>
                    <button onClick={() => setShowModal(true)} className="mt-4 text-indigo-400 hover:text-indigo-300">Create your first one</button>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {reminders.map((reminder) => (
                        <div key={reminder._id} className={clsx(
                            "group relative rounded-xl border p-6 transition-all hover:shadow-xl",
                            reminder.isActive ? "border-gray-800 bg-gray-900" : "border-gray-800 bg-gray-950 opacity-75"
                        )}>
                            <div className="mb-4 flex items-start justify-between">
                                <h3 className="text-lg font-bold text-white">{reminder.title}</h3>
                                <button
                                    onClick={() => handleToggleActive(reminder)}
                                    className={clsx(
                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                        reminder.isActive ? 'bg-indigo-600' : 'bg-gray-700'
                                    )}
                                >
                                    <span className={clsx(
                                        "inline-block h-4 w-4 transform rounded-full bg-white transition",
                                        reminder.isActive ? 'translate-x-6' : 'translate-x-1'
                                    )} />
                                </button>
                            </div>

                            <div className="mb-2 flex items-center gap-2 text-sm text-gray-300">
                                <Clock size={16} className="text-indigo-400" />
                                <span className="font-mono">{reminder.reminderTime}</span>
                                <span className="text-gray-600 px-1">|</span>
                                <Phone size={16} className="text-indigo-400" />
                                <span>{reminder.phone}</span>
                            </div>


                            <div className="mt-4 border-t border-gray-800 pt-4">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wilder">Internal Status (Today)</div>
                                    {reminder.lastSentAt && (
                                        <div className="text-xs text-gray-600" title="Last Sent">
                                            {new Date(reminder.lastSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <div className={clsx(
                                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium",
                                        reminder.dailyStatus === 'pending' && "bg-gray-800 text-gray-400",
                                        reminder.dailyStatus === 'sent' && "bg-blue-900/30 text-blue-400 border border-blue-900/50",
                                        reminder.dailyStatus === 'replied' && "bg-green-900/30 text-green-400 border border-green-900/50",
                                        reminder.dailyStatus === 'missed' && "bg-orange-900/30 text-orange-400 border border-orange-900/50",
                                        reminder.dailyStatus === 'failed' && "bg-red-900/30 text-red-400 border border-red-900/50",
                                    )}>
                                        {reminder.dailyStatus === 'replied' ? <CheckCircle size={14} /> :
                                            reminder.dailyStatus === 'missed' ? <AlertCircle size={14} /> :
                                                reminder.dailyStatus === 'sent' ? <Clock size={14} /> : null}
                                        <span className="capitalize">{reminder.dailyStatus}</span>
                                    </div>

                                    {/* Status Detail Badge */}
                                    {reminder.dailyStatus === 'replied' && (
                                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                                            Follow-up Stopped
                                        </span>
                                    )}
                                    {reminder.dailyStatus === 'sent' && !reminder.followUpSent && (
                                        <span className="inline-flex items-center rounded-full bg-blue-400/10 px-2 py-0.5 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-400/20">
                                            Waiting for Reply
                                        </span>
                                    )}
                                </div>
                            </div>

                            {reminder.replyText && (
                                <div className="mt-3 rounded bg-gray-800/50 p-3 text-sm text-gray-300">
                                    <span className="block text-xs text-gray-500 mb-1">Reply:</span>
                                    "{reminder.replyText}"
                                </div>
                            )}

                            <div className="absolute top-6 right-4 opacity-0 transition-opacity group-hover:opacity-100">
                                <button onClick={() => handleDelete(reminder._id)} className="p-2 text-gray-500 hover:text-red-400">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">New Reminder</h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className="rounded-full p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-300">Title</label>
                                    <input type="text" required placeholder="Morning Yoga"
                                        className="w-full rounded bg-gray-950 border border-gray-800 p-2 text-white focus:border-indigo-500 focus:outline-none"
                                        value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-300">Time (24h)</label>
                                    <input type="time" required
                                        className="w-full rounded bg-gray-950 border border-gray-800 p-2 text-white focus:border-indigo-500 focus:outline-none"
                                        value={formData.reminderTime} onChange={e => setFormData({ ...formData, reminderTime: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-300">Phone</label>
                                <input type="text" required placeholder="e.g. 9876543210"
                                    className="w-full rounded bg-gray-950 border border-gray-800 p-2 text-white focus:border-indigo-500 focus:outline-none"
                                    value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                                <p className="mt-1 text-xs text-gray-500">10-digit mobile number (India)</p>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-300">Reminder Message</label>
                                <textarea required rows={2} placeholder="Time to do your habit!"
                                    className="w-full rounded bg-gray-950 border border-gray-800 p-2 text-white focus:border-indigo-500 focus:outline-none"
                                    value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="mb-1 block text-sm font-medium text-gray-300">Follow-up Message</label>
                                    <input type="text" required
                                        className="w-full rounded bg-gray-950 border border-gray-800 p-2 text-white focus:border-indigo-500 focus:outline-none"
                                        value={formData.followUpMessage} onChange={e => setFormData({ ...formData, followUpMessage: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-gray-300">Follow-up Time</label>
                                    <input type="time" required
                                        className="w-full rounded bg-gray-950 border border-gray-800 p-2 text-white focus:border-indigo-500 focus:outline-none"
                                        value={formData.followUpTime} onChange={e => setFormData({ ...formData, followUpTime: e.target.value })}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="mt-4 w-full rounded bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                            >
                                {submitting ? 'Saving...' : 'Create Scheduler'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
