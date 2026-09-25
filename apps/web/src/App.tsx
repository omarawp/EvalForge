import {
  Activity,
  Database,
  FlaskConical,
  GitCompareArrows,
  Layers3,
  Settings2,
  ArrowUpRight,
} from "lucide-react";
import { NavLink, Outlet, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import DatasetsPage from "./pages/DatasetsPage";
import DatasetPage from "./pages/DatasetPage";
import PromptsPage from "./pages/PromptsPage";
import ProvidersPage from "./pages/ProvidersPage";
import RunsPage from "./pages/RunsPage";
import RunPage from "./pages/RunPage";
import ComparePage from "./pages/ComparePage";

const navigation = [
  { to: "/", label: "Overview", icon: Activity, end: true },
  { to: "/datasets", label: "Datasets", icon: Database },
  { to: "/prompts", label: "Prompts", icon: Layers3 },
  { to: "/providers", label: "Providers", icon: Settings2 },
  { to: "/runs", label: "Evaluation runs", icon: FlaskConical },
  { to: "/compare", label: "Compare runs", icon: GitCompareArrows },
];

function Shell() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            E<span>F</span>
          </div>
          <div>
            <strong>EvalForge</strong>
            <small>Evaluation workspace</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map((item) => (
            <NavLink
              end={item.end}
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <item.icon size={17} strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="local-dot" /> Local-first workspace{" "}
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            title="API documentation"
          >
            <ArrowUpRight size={15} />
          </a>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span>LLM EVALUATION / WORKSPACE</span>
          <span className="topbar-right">
            v0.1 <i />
          </span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="datasets" element={<DatasetsPage />} />
        <Route path="datasets/:id" element={<DatasetPage />} />
        <Route path="prompts" element={<PromptsPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="runs" element={<RunsPage />} />
        <Route path="runs/:id" element={<RunPage />} />
        <Route path="compare" element={<ComparePage />} />
      </Route>
    </Routes>
  );
}
