import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { MotionConfig } from 'framer-motion'
import { Layout, ScrollToTop } from '@/components/layout/Layout'
import Home from '@/pages/Home'
import NotFound from '@/pages/NotFound'
import { AuthProvider } from '@/lib/auth'
import { RequireAuth } from '@/components/auth/guards'

const Tournaments = lazy(() => import('@/pages/Tournaments'))
const TournamentPage = lazy(() => import('@/pages/TournamentPage'))
const Login = lazy(() => import('@/pages/auth/Login'))
const Register = lazy(() => import('@/pages/auth/Register'))
const Rating = lazy(() => import('@/pages/Rating'))
const About = lazy(() => import('@/pages/About'))
const Pricing = lazy(() => import('@/pages/Pricing'))
const Ballot = lazy(() => import('@/pages/Ballot'))
const DashboardLayout = lazy(() => import('@/pages/dashboard/DashboardLayout'))
const MyTournaments = lazy(() => import('@/pages/dashboard/MyTournaments'))
const CreateTournament = lazy(() => import('@/pages/dashboard/CreateTournament'))
const ManageTournament = lazy(() => import('@/pages/dashboard/ManageTournament'))
const Profile = lazy(() => import('@/pages/cabinet/Profile'))
const JudgeDashboard = lazy(() => import('@/pages/cabinet/JudgeDashboard'))
const AdminPanel = lazy(() => import('@/pages/cabinet/AdminPanel'))
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'))
const InvitePage = lazy(() => import('@/pages/InvitePage'))
const Notifications = lazy(() => import('@/pages/cabinet/Notifications'))

function PageLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <span className="ornament block w-16 animate-pulse text-primary" style={{ aspectRatio: '560/308' }} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <ScrollToTop />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="tournaments" element={<Tournaments />} />
                <Route path="tournaments/:id" element={<TournamentPage />} />
                <Route path="rating" element={<Rating />} />
                <Route path="about" element={<About />} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="ballot/:debateId" element={<RequireAuth><Ballot /></RequireAuth>} />
                <Route path="verify-email" element={<VerifyEmail />} />
                <Route path="invite/:token" element={<InvitePage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route path="login" element={<Login />} />
              <Route path="register" element={<Register />} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path="reset-password" element={<ResetPassword />} />
              {/* cabinets: every route needs a signed-in user; organizer/judge rights are checked per tournament by the API */}
              <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
                <Route path="me" element={<Profile />} />
                <Route path="judge" element={<JudgeDashboard />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="admin" element={<RequireAuth roles={['admin']}><AdminPanel /></RequireAuth>} />
                <Route path="dashboard">
                  <Route index element={<MyTournaments />} />
                  <Route path="tournaments/new" element={<CreateTournament />} />
                  <Route path="tournaments/:id/:section?" element={<ManageTournament />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
          <Toaster position="top-center" richColors closeButton />
        </BrowserRouter>
      </MotionConfig>
    </AuthProvider>
  )
}
