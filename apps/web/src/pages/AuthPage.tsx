import { PASSWORD } from '@siyasat/core';
import { ArrowRight, Check, CircleAlert, Eye, EyeOff, Info, LockKeyhole, Mail, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge, Logo, Spinner } from '../components/bits';
import { ApiError, authApi } from '../lib/api';
import { paths, safeNext } from '../lib/nav';
import { signIn, signUp, useAuth } from '../store/auth';

type Mode = 'signin' | 'signup';
type Fields = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OFFLINE = 'Siyasat can’t be reached. Check your internet connection and try again.';

/** The sign-in and sign-up pages: the product on one side, the form on the other. */
export function AuthPage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const nextQuery = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;

  useEffect(() => {
    document.title = `${mode === 'signin' ? 'Sign in' : 'Create an account'} · Siyasat`;
  }, [mode]);

  return (
    <div className="auth">
      <AuthArt />
      <main className="auth-main" id="main">
        <div className="auth-card">
          <Link className="auth-brand" to={paths.signIn + nextQuery}>
            <Logo tone="maroon" size={38} />
            <span>
              <b>Siyasat</b>
              <small>Citation checker</small>
            </span>
          </Link>
          {mode === 'signin' ? <SignInForm nextQuery={nextQuery} /> : <SignUpForm nextQuery={nextQuery} />}
        </div>
      </main>
    </div>
  );
}

function AuthArt() {
  return (
    <aside className="auth-art">
      <Link className="brand" to={paths.signIn}>
        <Logo size={42} />
        <div>
          <b>Siyasat</b>
          <small>Citation checker</small>
        </div>
      </Link>
      <div className="auth-pitch">
        <div className="eyebrow">
          <ShieldCheck className="ic" aria-hidden="true" /> Catch AI hallucinations
        </div>
        <h2>
          Every source in your paper, <em>checked</em>.
        </h2>
        <p>
          Siyasat looks up each reference in Crossref and OpenAlex, flags retracted papers and sources that don’t exist, and gives you a corrected
          reference list.
        </p>
      </div>
      <div className="auth-demo" aria-hidden="true">
        <div className="demo-ref">
          <Badge verdict="verified" />
          <p>
            LeCun, Y., Bengio, Y., &amp; Hinton, G. (2015). Deep learning. <i>Nature, 521</i>(7553), 436–444.
          </p>
        </div>
        <div className="demo-ref">
          <Badge verdict="not_found" />
          <p>
            Ramos, J. P. (2022). Citation graphs in Philippine higher education. <i>Journal of Learning Systems, 14</i>(3), 112–129.
          </p>
        </div>
      </div>
      <ul className="auth-points">
        <li>
          <Check className="ic" aria-hidden="true" /> Free to use
        </li>
        <li>
          <Check className="ic" aria-hidden="true" /> Your checks follow you to any device
        </li>
        <li>
          <Check className="ic" aria-hidden="true" /> APA, MLA, Chicago, Harvard, IEEE, Vancouver
        </li>
      </ul>
    </aside>
  );
}

/* ---------- Form pieces ---------- */

interface TextFieldProps {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  type?: string;
  autoComplete?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  trailing?: ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  after?: ReactNode;
}

function TextField({ id, label, icon: Icon, value, onChange, error, hint, type = 'text', autoComplete, inputRef, trailing, disabled, autoFocus, after }: TextFieldProps) {
  const described = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`afield${error ? ' invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="ainput">
        <Icon className="lead" aria-hidden="true" />
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          disabled={disabled}
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize={type === 'text' ? 'words' : 'none'}
        />
        {trailing}
      </div>
      {after}
      {hint && (
        <p className="ahint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="aerr" id={`${id}-err`}>
          <CircleAlert aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}

function PasswordField(props: Omit<TextFieldProps, 'icon' | 'type' | 'trailing'>) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      {...props}
      icon={LockKeyhole}
      type={shown ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          className="reveal"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          title={shown ? 'Hide password' : 'Show password'}
        >
          {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      }
    />
  );
}

/** A rough guide to how hard a new password is to guess. The server decides what it accepts. */
function strength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: '' };
  if (password.length < PASSWORD.min) {
    const more = PASSWORD.min - password.length;
    return { score: 1, label: `${more} more character${more === 1 ? '' : 's'}` };
  }
  if (/^(.)\1+$/.test(password) || /^(?:password|12345678|qwerty)/i.test(password)) return { score: 1, label: 'Easy to guess' };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let score = password.length >= 16 ? 3 : password.length >= 12 ? 2 : 1;
  if (kinds >= 3 || password.includes(' ')) score += 1;
  const s = Math.min(4, score) as 1 | 2 | 3 | 4;
  return { score: s, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][s]! };
}

function StrengthMeter({ password }: { password: string }) {
  const { score, label } = strength(password);
  if (!password) return null;
  return (
    <div className={`meter s${score}`} aria-live="polite">
      <div className="bars" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= score ? 'on' : ''} />
        ))}
      </div>
      <span>
        <span className="sr">Password strength: </span>
        {label}
      </span>
    </div>
  );
}

function FormError({ children }: { children: ReactNode }) {
  return (
    <div className="msg err auth-alert" role="alert">
      <CircleAlert className="ic" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** Put the cursor in the first field with a problem. */
function focusFirst(form: HTMLFormElement | null): void {
  form?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const form = useRef<HTMLFormElement>(null);

  const run = async (local: Fields, action: () => Promise<void>) => {
    setError(null);
    setFields(local);
    if (Object.keys(local).length) {
      requestAnimationFrame(() => focusFirst(form.current));
      return;
    }
    setBusy(true);
    try {
      // On success the app swaps this page for the one that was asked for.
      await action();
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError) {
        setFields(e.fields);
        if (!Object.keys(e.fields).length) setError(e.message);
        requestAnimationFrame(() => focusFirst(form.current));
      } else setError(OFFLINE);
    }
  };
  return { busy, error, fields, form, run };
}

/* ---------- Sign in ---------- */

function SignInForm({ nextQuery }: { nextQuery: string }) {
  const ended = useAuth((s) => s.ended);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, fields, form, run } = useSubmit();
  const id = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const local: Fields = {};
    if (!email.trim()) local['email'] = 'Enter your email address.';
    else if (!EMAIL.test(email.trim())) local['email'] = 'Enter a valid email address, like name@example.com.';
    if (!password) local['password'] = 'Enter your password.';
    void run(local, () => signIn(email.trim(), password));
  };

  return (
    <>
      <h1 className="auth-h">Welcome back</h1>
      <p className="auth-lead">Sign in to check your references and see your saved checks.</p>
      {ended && !error && (
        <div className="msg info auth-alert" role="status">
          <Info className="ic" aria-hidden="true" />
          <span>You’ve been signed out. Sign in again to carry on.</span>
        </div>
      )}
      {error && <FormError>{error}</FormError>}
      <form ref={form} className="auth-form" onSubmit={submit} noValidate>
        <TextField
          id={`${id}-email`}
          label="Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={fields['email']}
          autoFocus
        />
        <PasswordField id={`${id}-password`} label="Password" autoComplete="current-password" value={password} onChange={setPassword} error={fields['password']} />
        <button type="submit" className="primary lg auth-submit" disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Signing in…
            </>
          ) : (
            <>
              Sign in <ArrowRight className="ic" aria-hidden="true" />
            </>
          )}
        </button>
      </form>
      <p className="auth-switch">
        New to Siyasat? <Link to={paths.signUp + nextQuery}>Create an account</Link>
      </p>
    </>
  );
}

/* ---------- Sign up ---------- */

function SignUpForm({ nextQuery }: { nextQuery: string }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [website, setWebsite] = useState('');
  const { busy, error, fields, form, run } = useSubmit();
  const id = useId();

  useEffect(() => {
    authApi
      .config()
      .then((c) => setOpen(c.signupsOpen))
      .catch(() => setOpen(true));
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const local: Fields = {};
    if (!name.trim()) local['name'] = 'Enter your name.';
    if (!email.trim()) local['email'] = 'Enter your email address.';
    else if (!EMAIL.test(email.trim())) local['email'] = 'Enter a valid email address, like name@example.com.';
    if (password.length < PASSWORD.min) local['password'] = `Use at least ${PASSWORD.min} characters.`;
    void run(local, () => signUp(name.trim(), email.trim(), password, website));
  };

  const closed = open === false;
  return (
    <>
      <h1 className="auth-h">Create your account</h1>
      <p className="auth-lead">It takes a minute, and your checks are saved to your account from then on.</p>
      {closed && (
        <div className="msg info auth-alert" role="status">
          <Info className="ic" aria-hidden="true" />
          <span>New sign-ups are paused for now. Please try again later. If you already have an account, you can still sign in.</span>
        </div>
      )}
      {error && <FormError>{error}</FormError>}
      <form ref={form} className="auth-form" onSubmit={submit} noValidate>
        <TextField
          id={`${id}-name`}
          label="Name"
          icon={UserRound}
          autoComplete="name"
          value={name}
          onChange={setName}
          error={fields['name']}
          disabled={closed}
          autoFocus
        />
        <TextField
          id={`${id}-email`}
          label="Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={fields['email']}
          disabled={closed}
        />
        <PasswordField
          id={`${id}-password`}
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={fields['password']}
          disabled={closed}
          hint={`At least ${PASSWORD.min} characters. A short phrase is easy to remember and hard to guess.`}
          after={<StrengthMeter password={password} />}
        />
        {/* Hidden from people and from screen readers. Bots that fill in every field give themselves away. */}
        <div className="hp" aria-hidden="true">
          <label htmlFor={`${id}-website`}>Website</label>
          <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <button type="submit" className="primary lg auth-submit" disabled={busy || closed || open === null}>
          {busy ? (
            <>
              <Spinner /> Creating your account…
            </>
          ) : (
            <>
              Create account <ArrowRight className="ic" aria-hidden="true" />
            </>
          )}
        </button>
        <p className="auth-fine">
          Lookups are limited per account so the service stays fast for everyone. Accounts used for automated or bulk lookups may be suspended.
        </p>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to={paths.signIn + nextQuery}>Sign in</Link>
      </p>
    </>
  );
}
