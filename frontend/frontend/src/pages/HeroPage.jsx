import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";

/**
 * HeroCard: 3D Tilt effect with dynamic spotlight/glare
 */
function HeroCard({ children, className = "" }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-150, 150], [12, -12]);
  const rotateY = useTransform(x, [-150, 150], [-12, 12]);

  return (
    <motion.div
      style={{ perspective: 1500 }}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        x.set(event.clientX - rect.left - rect.width / 2);
        y.set(event.clientY - rect.top - rect.height / 2);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      className={`relative group ${className}`}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        transition={{ type: "spring", stiffness: 220, damping: 25 }}
        className="h-full w-full"
      >
        {/* Deep Glow Layer */}
        <div className="absolute -inset-1 rounded-[32px] bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-0 blur-2xl transition duration-500 group-hover:opacity-20" />
        {children}
      </motion.div>
    </motion.div>
  );
}

/**
 * Pill: Vibrant status tags
 */
function Pill({ children, dark = false, color = "indigo" }) {
  const variants = {
    indigo: dark ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" : "bg-indigo-50 text-indigo-600 border-indigo-200",
    emerald: dark ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200",
    amber: dark ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${variants[color] || variants.indigo}`}>
      {children}
    </span>
  );
}

/**
 * Background Decorations: Animated SVG patterns
 */
const GridBackground = ({ isDark }) => (
  <div className="absolute inset-0 -z-10 overflow-hidden">
    <svg className="absolute h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke={isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
    <div className={`absolute inset-0 bg-gradient-to-b ${isDark ? "from-transparent via-[#0a0c10]/80 to-[#0a0c10]" : "from-transparent via-[#f8fafc]/80 to-[#f8fafc]"}`} />
  </div>
);

export default function HeroPage() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState("dark");
  const isDark = theme === "dark";

  const testimonials = [
    {
      quote: "The workflow feels focused. It keeps planning and execution in one place.",
      name: "Avery Chen",
      role: "Product Lead @ Linear",
      avatar: "AC",
    },
    {
      quote: "The interface is calm and easy to understand. It fits a real team environment.",
      name: "Mina Patel",
      role: "Ops Manager @ Vercel",
      avatar: "MP",
    },
    {
      quote: "It gives the project a clear structure without feeling heavy or technical.",
      name: "Jordan Lee",
      role: "Founder @ Stripe",
      avatar: "JL",
    },
  ];

  const features = [
    { title: "Real-time Sync", desc: "Collaborate instantly with 0ms latency.", icon: "⚡" },
    { title: "Privacy First", desc: "End-to-end encryption for every project.", icon: "🔐" },
    { title: "Custom Flows", desc: "Adapt the board to your team's unique rhythm.", icon: "🌊" },
  ];

  return (
    <div className={`min-h-screen relative transition-colors duration-1000 ${isDark ? "bg-[#0a0c10] text-slate-200" : "bg-[#f8fafc] text-slate-800"}`}>
      <GridBackground isDark={isDark} />

      {/* Navigation */}
      <nav className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-all ${isDark ? "border-white/5 bg-black/20" : "border-black/5 bg-white/60"}`}>
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-8">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/20 flex items-center justify-center text-white font-black text-xl transition-transform group-hover:rotate-12">H</div>
            <p className="text-xl font-black tracking-tighter">HARDCODE</p>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#" className="hover:text-indigo-500 transition-colors">Product</a>
            <a href="#" className="hover:text-indigo-500 transition-colors">Changelog</a>
            <a href="#" className="hover:text-indigo-500 transition-colors">Pricing</a>
          </div>

          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`rounded-full px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${
              isDark ? "bg-white text-black shadow-white/10" : "bg-slate-900 text-white shadow-slate-900/10"
            } shadow-xl`}
          >
            {isDark ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-16 lg:py-24">
        {/* Hero Section */}
        <div className="grid gap-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex gap-3">
              <Pill dark={isDark} color="indigo">New: Version 4.0</Pill>
              <Pill dark={isDark} color="emerald">AI Powered</Pill>
            </div>
            
            <h1 className={`mt-8 text-6xl font-black tracking-tight sm:text-8xl leading-[0.9] ${isDark ? "text-white" : "text-slate-900"}`}>
              Software that <br />
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                feels like silk.
              </span>
            </h1>

            <p className={`mt-8 max-w-xl text-xl leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              HardCode is a high-performance project workspace designed for teams who value clarity over complexity. 
              No clutter, no bloat—just pure execution.
            </p>

            <div className="mt-12 flex flex-wrap gap-5">
              <button
                onClick={() => navigate("/auth")}
                className="group relative rounded-2xl bg-indigo-600 px-10 py-5 text-sm font-bold text-white shadow-2xl shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:-translate-y-1 active:scale-95"
              >
                <span className="relative z-10">Start building now</span>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              
              <button
                onClick={() => navigate("/auth")}
                className={`rounded-2xl border-2 px-10 py-5 text-sm font-bold transition-all hover:bg-slate-500/5 ${
                  isDark ? "border-white/10 text-white" : "border-slate-200 text-slate-800"
                }`}
              >
                Book a demo
              </button>
            </div>

            <div className="mt-12 flex items-center gap-4">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-10 w-10 rounded-full border-4 ${isDark ? "border-slate-950" : "border-white"} bg-slate-800 flex items-center justify-center text-[10px] font-bold`}>
                    U{i}
                  </div>
                ))}
              </div>
              <p className="text-sm font-medium opacity-60">Trusted by 2,000+ engineering teams</p>
            </div>
          </motion.div>

          <HeroCard className="hidden lg:block">
            <div className={`rounded-[40px] border p-8 shadow-2xl backdrop-blur-3xl ${isDark ? "bg-slate-900/40 border-white/10" : "bg-white border-slate-200"}`}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Current Sprint</p>
                  <h3 className="text-2xl font-bold">Alpha Release</h3>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  { label: "Refactor Auth Flow", status: "Done", color: "emerald" },
                  { label: "Design System V2", status: "In Progress", color: "amber" },
                  { label: "Websocket Scaling", status: "Next", color: "indigo" },
                ].map((task) => (
                  <div key={task.label} className={`group flex items-center justify-between p-5 rounded-2xl border transition-all hover:scale-[1.02] ${isDark ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-100"}`}>
                    <span className="font-semibold">{task.label}</span>
                    <Pill dark={isDark} color={task.color}>{task.status}</Pill>
                  </div>
                ))}
              </div>
            </div>
          </HeroCard>
        </div>

        {/* Feature Bento Grid */}
        <div className="mt-32 grid gap-6 md:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`p-8 rounded-[32px] border transition-all hover:border-indigo-500/50 ${isDark ? "bg-slate-900/30 border-white/5" : "bg-white border-slate-200"}`}
            >
              <div className="text-4xl mb-6">{f.icon}</div>
              <h4 className="text-xl font-bold mb-2">{f.title}</h4>
              <p className="opacity-60 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Testimonials Section (The "Fucking" Testimonials) */}
        <div className="mt-32">
          <div className="text-center mb-16">
            <Pill dark={isDark} color="amber">Wall of Love</Pill>
            <h2 className={`mt-6 text-4xl font-black sm:text-5xl ${isDark ? "text-white" : "text-slate-900"}`}>
              Built for people who <br /> ship high-quality work.
            </h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative group p-8 rounded-[32px] border transition-all hover:-translate-y-2 ${
                  isDark ? "bg-slate-900/50 border-white/5 hover:bg-slate-900" : "bg-white border-slate-200 hover:shadow-xl"
                }`}
              >
                {/* Quote Icon SVG */}
                <svg className="absolute top-6 right-8 w-10 h-10 opacity-10 group-hover:text-indigo-500 group-hover:opacity-30 transition-all" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 8.44772 14.017 9V12C14.017 12.5523 13.5693 13 13.017 13H11.017L11.017 21H14.017ZM5.017 21L5.017 18C5.017 16.8954 5.91243 16 7.017 16H10.017C10.5693 16 11.017 15.5523 11.017 15V9C11.017 8.44772 10.5693 8 10.017 8H6.017C5.46472 8 5.017 8.44772 5.017 9V12C5.017 12.5523 4.56931 13 4.017 13H2.017L2.017 21H5.017Z" /></svg>
                
                <p className="relative z-10 text-lg italic leading-relaxed opacity-80 mb-8">
                  “{t.quote}”
                </p>

                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                    {t.avatar}
                  </div>
                  <div>
                    <h5 className="font-bold">{t.name}</h5>
                    <p className="text-xs opacity-50 uppercase tracking-widest font-bold">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <motion.div 
          className="mt-32 p-1 relative rounded-[40px] bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 overflow-hidden"
          whileHover={{ scale: 1.01 }}
        >
          <div className={`p-12 md:p-20 rounded-[38px] text-center ${isDark ? "bg-[#0a0c10]" : "bg-white"}`}>
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter mb-8">
              Ready to clear the <br /> noise?
            </h2>
            <button className="bg-white text-black px-12 py-5 rounded-2xl font-black text-lg shadow-2xl hover:bg-slate-100 transition-all">
              Sign up for Free
            </button>
            <p className="mt-8 opacity-40 text-sm font-medium">No credit card required. Cancel anytime.</p>
          </div>
        </motion.div>

      </main>

      <footer className="py-12 border-t border-current/5 mt-20 text-center opacity-40 text-xs font-bold uppercase tracking-[0.3em]">
        © 2026 HardCode Engineering. All Rights Reserved.
      </footer>
    </div>
  );
}