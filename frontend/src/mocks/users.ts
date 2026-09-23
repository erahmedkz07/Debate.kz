import type { TeamRegistration, User } from '@/types'
import { tournamentData } from './data'

// Demo accounts (password for all: demo1234). The judge and the participant
// are linked to real people from the mock tournaments so their cabinets have data.
export const DEMO_PASSWORD = 'demo1234'

const judgeName = tournamentData.t4.judges[0].name
const studentName = tournamentData.t4.teams[0].speakers[0].name

export const users: User[] = [
  { id: 'u-admin', name: 'Администратор Debate.kz', email: 'admin@debate.kz', role: 'admin', city: 'Астана', createdAt: '2026-01-10' },
  { id: 'u-org', name: 'Аргын Ахмед', email: 'org@debate.kz', phone: '+7 701 111 22 33', role: 'organizer', institution: 'Дебатный клуб «Шешен»', city: 'Астана', createdAt: '2026-02-01' },
  { id: 'u-judge', name: judgeName, email: 'judge@debate.kz', phone: '+7 702 222 33 44', role: 'judge', institution: 'Nazarbayev University', city: 'Астана', createdAt: '2026-03-15' },
  { id: 'u-student', name: studentName, email: 'student@debate.kz', phone: '+7 705 333 44 55', role: 'participant', institution: tournamentData.t4.teams[0].institution, city: 'Караганда', createdAt: '2026-04-02' },
  { id: 'u5', name: 'Динара Касымова', email: 'dinara@mail.kz', role: 'organizer', institution: 'Лицей №15', city: 'Павлодар', createdAt: '2026-05-20' },
  { id: 'u6', name: 'Тимур Оспанов', email: 'timur@mail.kz', role: 'judge', institution: 'КазНУ им. аль-Фараби', city: 'Алматы', createdAt: '2026-06-11' },
  { id: 'u7', name: 'Аружан Бекова', email: 'aruzhan@mail.kz', role: 'participant', institution: 'НИШ ФМН', city: 'Астана', createdAt: '2026-07-03' },
  { id: 'u8', name: 'Максим Ким', email: 'maxim@mail.kz', role: 'participant', institution: 'КТЛ', city: 'Актобе', createdAt: '2026-08-19', blocked: true },
  { id: 'u9', name: 'Сабина Нурланова', email: 'sabina@mail.kz', role: 'judge', institution: 'ЕНУ им. Гумилёва', city: 'Астана', createdAt: '2026-09-01' },
]

// judge user -> judge records in tournaments (one person can judge several tournaments)
export const judgeLinks: Record<string, string[]> = {
  'u-judge': ['t4-j1', 't5-j2', 't7-j1'],
}

// participant user -> teams they speak for
export const participantTeams: Record<string, string[]> = {
  'u-student': ['t4-team1'],
}

// participant user -> team registrations
export const initialRegistrations: Record<string, TeamRegistration[]> = {
  'u-student': [
    {
      id: 'reg-1', tournamentId: 't4', teamName: tournamentData.t4.teams[0].name, institution: tournamentData.t4.teams[0].institution,
      speakers: tournamentData.t4.teams[0].speakers.map(s => s.name), status: 'confirmed', createdAt: '2026-09-02',
    },
    {
      id: 'reg-2', tournamentId: 't1', teamName: tournamentData.t4.teams[0].name, institution: tournamentData.t4.teams[0].institution,
      speakers: tournamentData.t4.teams[0].speakers.map(s => s.name), status: 'pending', createdAt: '2026-09-20',
    },
  ],
}

export const roleHome: Record<User['role'], string> = {
  participant: '/me',
  organizer: '/dashboard',
  judge: '/judge',
  admin: '/admin',
}
