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

    messageType?: 'text' | 'template';
    templateName?: string;
    templateLanguage?: string;

    isActive: boolean;
    dailyStatus: 'pending' | 'sent' | 'replied' | 'missed' | 'failed' | 'completed';
    replyText?: string;
    lastSentAt?: string;
    followUpSent?: boolean;
    createdAt?: string;
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
        messageType: 'text',
        templateName: 'hello_world',
        templateLanguage: 'en_US'
    });
    const [submitting, setSubmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Filtering State
    const [filterType, setFilterType] = useState<'all' | 'today' | 'date'>('today');
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);

    // Computed Filtered Reminders
    const filteredReminders = reminders.filter(r => {
        if (filterType === 'all') return true;

        // Convert Reminder Creation Time to IST YYYY-MM-DD
        const createdDate = r.createdAt
            ? new Date(r.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
            : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // Fallback

        if (filterType === 'today') {
            const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
            return createdDate === today;
        }

        if (filterType === 'date') {
            return createdDate === filterDate;
        }
        return true;
    });

    // Stats based on Filtered Data or Total? usually Total stats are useful globally, but let's show Filtered Stats
    const stats = {
        total: filteredReminders.length,
        active: filteredReminders.filter(r => r.isActive).length,
        completed: filteredReminders.filter(r => r.dailyStatus === 'completed' || r.dailyStatus === 'replied').length,
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
            const payload = { ...formData };
            if (payload.messageType === 'template' && !payload.message) {
                payload.message = `Template: ${payload.templateName}`;
            }

            const res = await fetch('/api/reminders', {
                method: 'POST',
                body: JSON.stringify(payload),
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
                    messageType: 'text',
                    templateName: 'hello_world',
                    templateLanguage: 'en_US'
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
            <header className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-cyan-600 inline-block">
                        HabbitVerse Monitor
                    </h1>
                    <div className="mt-2 flex items-center gap-3">
                        <p className="text-gray-500">One-time reminders with smart follow-up tracking.</p>
                        {lastUpdated && (
                            <span className="text-xs text-gray-400 border-l pl-3 ml-2 border-gray-300">
                                Updated: {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>

                {/* Controls & Filter */}
                <div className="flex flex-col items-end gap-3">

                    {/* Filter Bar */}
                    <div className="flex items-center bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                        <button
                            onClick={() => setFilterType('all')}
                            className={clsx("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", filterType === 'all' ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-50")}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setFilterType('today')}
                            className={clsx("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", filterType === 'today' ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-50")}
                        >
                            Today
                        </button>
                        <div className="flex items-center border-l pl-2 ml-2 border-gray-200">
                            <input
                                type="date"
                                value={filterDate}
                                onChange={(e) => {
                                    setFilterDate(e.target.value);
                                    setFilterType('date');
                                }}
                                className={clsx(
                                    "text-sm p-1 border rounded focus:outline-none focus:ring-1 focus:ring-indigo-500",
                                    filterType === 'date' ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600"
                                )}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Stats Summary */}
                        <div className="flex gap-4 text-xs font-semibold uppercase tracking-wide text-gray-500 mr-4">
                            <span title="Total in view">Total: <span className="text-gray-900">{stats.total}</span></span>
                            <span title="Pending execution" className="text-green-600">Active: {stats.active}</span>
                            <span title="Finished" className="text-indigo-600">Done: {stats.completed}</span>
                        </div>

                        <button
                            onClick={handleManualRefresh}
                            disabled={refreshing}
                            className="p-2 text-gray-500 hover:text-indigo-600 transition"
                            title="Refresh Data"
                        >
                            <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
                        </button>

                        <button
                            onClick={() => setShowModal(true)}
                            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-500"
                        >
                            <Plus size={18} /> New
                        </button>
                    </div>
                </div>
            </header>

            {/* Grid */}
            {loading ? (
                <div className="flex justify-center p-20 text-indigo-500 animate-pulse">Loading reminders...</div>
            ) : filteredReminders.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
                    <p className="text-gray-400">No reminders found for this filter.</p>
                    <p className="text-xs text-gray-400 mt-2">Try changing the filter or create a new one.</p>
                    <button onClick={() => setShowModal(true)} className="mt-4 text-indigo-500 hover:text-indigo-600 font-medium">Create Reminder</button>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                    {filteredReminders.map((reminder) => (
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
                                        {/* Show Date if filtered by All */}
                                        {filterType === 'all' && reminder.createdAt && (
                                            <span className="text-[10px] text-gray-400">
                                                {new Date(reminder.createdAt).toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}
                                            </span>
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
                                                    reminder.dailyStatus === 'missed' ? "bg-red-500 text-white" :
                                                        "bg-gray-200 text-gray-400"
                                        )}>
                                            {reminder.dailyStatus === 'completed' ? <CheckCircle size={12} /> :
                                                reminder.dailyStatus === 'replied' ? <MessageCircle size={12} /> :
                                                    reminder.dailyStatus === 'missed' ? <X size={12} /> :
                                                        <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                                        </div>
                                        <span className={clsx("text-xs font-medium",
                                            reminder.dailyStatus === 'completed' ? "text-green-600" :
                                                reminder.dailyStatus === 'replied' ? "text-blue-600" :
                                                    reminder.dailyStatus === 'missed' ? "text-red-600" : "text-gray-400")}>
                                            {reminder.dailyStatus === 'completed' ? 'Done' :
                                                reminder.dailyStatus === 'missed' ? 'Missed' : 'Reply'}
                                        </span>
                                    </div>

                                    {/* Step 4: Follow-up */}
                                    <div className="flex flex-col items-center gap-2">
                                        <div className={clsx(
                                            "h-6 w-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-colors",
                                            reminder.followUpSent ? "bg-amber-500 text-white" :
                                                (reminder.dailyStatus === 'completed' || reminder.dailyStatus === 'replied' || reminder.dailyStatus === 'missed') ? "bg-gray-100 text-gray-300" : // Cancelled/Skipped
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
                                                    reminder.dailyStatus === 'missed' ? "bg-red-100 text-red-700" :
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
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Time (12h)</label>
                                    <TimePicker
                                        value={formData.reminderTime}
                                        onChange={(val) => setFormData({ ...formData, reminderTime: val })}
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

                            <div className="bg-white p-3 rounded-lg border border-gray-100 space-y-3">
                                <label className="block text-sm font-medium text-gray-700">Message Type</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio"
                                            name="msgType"
                                            checked={formData.messageType === 'text'}
                                            onChange={() => setFormData({ ...formData, messageType: 'text' })}
                                            className="text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm">Custom Text</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio"
                                            name="msgType"
                                            checked={formData.messageType === 'template'}
                                            onChange={() => setFormData({ ...formData, messageType: 'template' })}
                                            className="text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm flex items-center gap-1">
                                            Meta Template
                                            <span className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5 rounded-full font-medium">Bypass 24h</span>
                                        </span>
                                    </label>
                                </div>

                                {formData.messageType === 'text' ? (
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-gray-700">Message Content</label>
                                        <textarea required rows={2} placeholder="Time to do your habit!"
                                            className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none"
                                            value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })}
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-1">
                                            <label className="mb-1 block text-sm font-medium text-gray-700">Template Name</label>
                                            <input type="text" required placeholder="hello_world"
                                                className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none"
                                                value={formData.templateName} onChange={e => setFormData({ ...formData, templateName: e.target.value })}
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="mb-1 block text-sm font-medium text-gray-700">Language</label>
                                            <input type="text" required placeholder="en_US"
                                                className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none"
                                                value={formData.templateLanguage} onChange={e => setFormData({ ...formData, templateLanguage: e.target.value })}
                                            />
                                        </div>
                                        <div className="col-span-2 text-[10px] text-gray-500">
                                            ⚠️ Creates a conversation window. Use <strong>hello_world</strong> for testing.
                                        </div>
                                    </div>
                                )}
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
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Time (12h)</label>
                                    <TimePicker
                                        value={formData.followUpTime}
                                        onChange={(val) => setFormData({ ...formData, followUpTime: val })}
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
                </div >
            )
            }
        </div >
    );
}

// Helper Component for 12h Time Picker
function TimePicker({ value, onChange }: { value: string, onChange: (val: string) => void }) {
    // Parse "HH:mm" (24h) to 12h components
    const [hour24, minute] = value.split(':').map(Number);

    // Convert to 12h
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12; // 0 -> 12, 13 -> 1

    const handleUpdate = (h: number, m: number, p: string) => {
        let h24 = h;
        if (p === 'PM' && h !== 12) h24 += 12;
        if (p === 'AM' && h === 12) h24 = 0;

        const timeStr = `${h24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        onChange(timeStr);
    };

    return (
        <div className="flex items-center gap-1">
            <select
                value={hour12}
                onChange={e => handleUpdate(Number(e.target.value), minute, period)}
                className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none"
            >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                    <option key={h} value={h}>{h}</option>
                ))}
            </select>
            <span className="text-gray-400">:</span>
            <select
                value={minute}
                onChange={e => handleUpdate(hour12, Number(e.target.value), period)}
                className="w-full rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none"
            >
                {Array.from({ length: 12 }, (_, i) => i * 5).map(m => (
                    <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                ))}
            </select>
            <select
                value={period}
                onChange={e => handleUpdate(hour12, minute, e.target.value)}
                className="w-20 rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-900 focus:border-indigo-500 focus:outline-none"
            >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
            </select>
        </div>
    );
}
