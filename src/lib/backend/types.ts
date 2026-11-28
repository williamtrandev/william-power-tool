import type { Command, CommandInput, HistoryRow } from '../commands';
import type { OtChange, OtEntry, OtInput, OtMonth, OtPerson, OtPersonInput } from '../ot';
import type { AccountActivity, AccountCode, AccountInput, AheadCodes, OtpCode, TeamAccount } from '../otp';
import type { OutboxState } from './outbox';

export type MemberStatus = 'pending' | 'approved' | 'blocked';
export type MemberRole = 'member' | 'admin';

export interface Member {
  user_id: string;
  email: string;
  status: MemberStatus;
  role: MemberRole;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

/** an approved member, as anyone may see them (to share an account with) */
export type DirectoryEntry = Pick<Member, 'user_id' | 'email' | 'full_name' | 'avatar_url'>;

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  /** when the person last actually signed in (token refreshes do not count) */
  signedInAt?: string;
}

export interface Backend {
  mode: 'supabase' | 'demo';
  /** signed-in user, or null */
  session(): Promise<User | null>;
  onAuthChange(cb: (u: User | null) => void): () => void;
  /** redirects to Google; the session is picked up when the browser comes back */
  signInWithGoogle(): Promise<void>;
  /** demo only: switch to one of the fake accounts */
  signInAs?(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** whether reads come from the server, or from what was saved on this device because it cannot be reached
   * (`savedAt`: when that data was fetched) — see cache.ts */
  onConnection?(cb: (offline: boolean, savedAt?: number) => void): () => void;
  // changes made offline, waiting on this device until the server answers again — see outbox.ts
  /** called now and on every change of the queue */
  onOutbox?(cb: (s: OutboxState) => void): () => void;
  /** after queued changes reached the server (or one was dropped): time to read again */
  onSynced?(cb: () => void): () => void;
  outboxSync?(): Promise<void>;
  /** a change the server did not take: `keep` sends it anyway, otherwise it is dropped */
  outboxResolve?(qid: string, keep: boolean): Promise<void>;
  /** the OT roster as last read, to name the people in queued OT changes */
  outboxPeople?(): Map<string, OtPerson>;
  /** this user's access row (created as "pending" on sign-up) */
  me(): Promise<Member | null>;
  // admin
  members(): Promise<Member[]>;
  setMember(userId: string, status: MemberStatus, role: MemberRole): Promise<void>;
  // commands
  list(): Promise<Command[]>;
  create(input: CommandInput): Promise<Command>;
  update(id: string, input: CommandInput): Promise<Command>;
  remove(id: string): Promise<void>;
  bump(id: string): Promise<void>;
  history(id: string): Promise<HistoryRow[]>;
  // shared accounts — password and OTP secret stay in the database; each reveal is logged
  acctList(): Promise<TeamAccount[]>;
  acctPassword(id: string): Promise<string>;
  acctCode(id: string): Promise<OtpCode>;
  /** current + next code of every given account the user may use; seeing is logged at most hourly */
  acctCodes(ids: string[]): Promise<AccountCode[]>;
  /** the codes of the next 4 hours, for putting in an OTP while the server cannot be reached; logged at most hourly */
  acctCodesAhead(ids: string[]): Promise<AheadCodes[]>;
  /** log that a code was copied */
  acctCopied(id: string): Promise<void>;
  /** admin; returns the account id */
  acctSave(id: string | null, input: AccountInput): Promise<string>;
  acctDelete(id: string): Promise<void>;
  acctMembers(id: string): Promise<string[]>;
  acctActivity(): Promise<AccountActivity[]>;
  /** approved members, for sharing an account with selected people */
  directory(): Promise<DirectoryEntry[]>;
  // overtime — shared by the team: any member reads and writes anyone's hours
  /** the OT roster, people without an account included */
  otPeople(): Promise<OtPerson[]>;
  /** id null adds someone */
  otPersonSave(id: string | null, input: OtPersonInput): Promise<OtPerson>;
  /** admin; refused while the person still has OT logged */
  otPersonDelete(id: string): Promise<void>;
  otList(from: string, to: string): Promise<OtMonth>;
  /** id null adds a new day */
  otSave(id: string | null, input: OtInput): Promise<OtEntry>;
  /** several people at once; a person who already has that day is skipped, or overwritten when asked. Returns how many rows were written */
  otSaveMany(rows: OtInput[], overwrite: boolean): Promise<number>;
  otDelete(id: string): Promise<void>;
  /** changes to OT rows of days in [from, to], newest first — written by the database, readable by all */
  otHistory(from: string, to: string): Promise<OtChange[]>;
}
