// Mail transport. For now every email is printed to the server console;
// swap the body of send() for SMTP (e.g. nodemailer) when deploying.
export interface Mail {
  to: string
  subject: string
  text: string
}

export async function sendMail(mail: Mail) {
  const line = '─'.repeat(64)
  console.log(`\n${line}\n📧  EMAIL (console transport)\nTo:      ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n${line}\n`)
}
