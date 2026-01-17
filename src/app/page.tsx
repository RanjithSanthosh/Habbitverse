import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard'); // Dashboard middleware will handle auth check, or we redirect to login if fail
}
