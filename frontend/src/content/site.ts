// The operator of the platform: shown in the footer and in the legal pages.
// Fill in before the public launch (deploy/README.md, checklist). An empty contact is simply not shown in the footer;
// the legal pages show a visible placeholder instead, so a missing detail cannot go unnoticed.
export const SITE = {
  operator: { ru: '', kz: '' }, // e.g. ИП «Ахмед Ермек» / «Ахмед Ермек» ЖК
  bin: '', // ИИН (ИП) or БИН (ТОО)
  address: { ru: '', kz: '' }, // legal address
  email: '', // e.g. hello@debate.kz — must be a working mailbox
  phone: '',
  telegram: '', // e.g. https://t.me/debatekz
  editionDate: '2026-09-29', // the date of the current edition of the privacy policy and the terms
}

export const placeholder = { ru: '[заполняется перед запуском]', kz: '[іске қосар алдында толтырылады]' }
