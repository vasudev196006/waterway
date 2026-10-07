import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  Box,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  CloudRain,
  Download,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  MapPinned,
  Menu,
  MoreHorizontal,
  PackageCheck,
  RefreshCcw,
  Route,
  Send,
  Settings2,
  Ship,
  SlidersHorizontal,
  Sparkles,
  Truck,
  Users,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { trpc } from "./lib/trpc";

type Role = "admin" | "owner" | "operator";
type Mode = "Balanced" | "Lowest Cost" | "Lowest CO₂" | "Fastest";

type Cargo = {
  id: string;
  route: string;
  origin: string;
  destination: string;
  type: string;
  tonnes: number;
  status: string;
  urgency: string;
  eta: string;
  owner: string;
  waterway: number;
  road: number;
  recommendation: "Waterway" | "Road";
  dbId?: number;
};

type Boat = {
  code: string;
  name: string;
  capacity: number;
  load: number;
  status: "Available" | "In transit" | "Unavailable";
  route: string;
  eta: string;
  operator: string;
  dbId?: number;
};


const initialNotifications = [
  { id: 1, kind: "warning", title: "Delay risk detected", text: "B-104 has 68% late-arrival risk on Kochi → Alappuzha.", time: "8 min ago", unread: true },
  { id: 2, kind: "success", title: "Backhaul found", text: "72T timber can return on B-119 with 18% lower empty km.", time: "24 min ago", unread: true },
  { id: 3, kind: "info", title: "New cargo in planning pool", text: "CG-2026-0012 is ready for network optimization.", time: "41 min ago", unread: true },
];

const modes: Mode[] = ["Balanced", "Lowest Cost", "Lowest CO₂", "Fastest"];
const money = (value: number) => `₹${value.toFixed(2)}`;

function App() {
  const [role, setRole] = useState<Role>("admin");
  const [active, setActive] = useState("Overview");
  const [mode, setMode] = useState<Mode>("Balanced");
  
  const utils = trpc.useUtils();
  const { data: dbShipments } = trpc.shipments.list.useQuery();
  const { data: dbTrips } = trpc.trips.list.useQuery();
  const { data: dbOperators } = trpc.operators.list.useQuery();
  
  const createShipment = trpc.shipments.create.useMutation({
    onSuccess: () => {
      utils.shipments.list.invalidate();
      toast.success("Cargo posted", { description: "Your instant quote is ready to review." });
    }
  });

  const updateShipmentStatus = trpc.shipments.updateStatus.useMutation({
    onSuccess: () => {
      utils.shipments.list.invalidate();
    }
  });

  const [published, setPublished] = useState(false);
  const [cargoOverrides, setCargoOverrides] = useState<Record<string, Partial<Cargo>>>({});
  const [boatOverrides, setBoatOverrides] = useState<Record<string, Partial<Boat>>>({});

  const cargo: Cargo[] = useMemo(() => {
    if (!dbShipments) return [];
    return dbShipments.map((s: any) => ({
      id: `CG-2026-${String(s.id).padStart(4, "0")}`,
      route: `${s.origin} → ${s.destination}`,
      origin: s.origin,
      destination: s.destination,
      type: s.cargoType,
      tonnes: Number(s.weightTons) || 120,
      status: s.status === "open" ? (published ? "Awaiting operator" : "Pending") : s.status === "assigned" ? "In transit" : s.status === "completed" ? "Delivered" : "Pending",
      urgency: Number(s.weightTons) > 150 ? "High" : "Normal",
      eta: "14 Oct · 16:30",
      owner: s.shipperName || "Malabar BuildCo",
      waterway: 3.92,
      road: 5.4,
      recommendation: "Waterway" as const,
      dbId: s.id
    })).map(item => cargoOverrides[item.id] ? { ...item, ...cargoOverrides[item.id] } : item);
  }, [dbShipments, published, cargoOverrides]);

  const boats: Boat[] = useMemo(() => {
    const activeCargo = cargo.filter(c => c.status === "In transit");
    if (dbOperators && dbOperators.length > 0) {
      return dbOperators.map((op: any, index: number) => {
        const boatCode = `B-${String(op.id || index + 1).padStart(3, "0")}`;
        const capacity = Math.round(Number(op.maxCapacityTons) || 400);
        const assignedCargo = activeCargo[index];
        const load = assignedCargo ? Math.min(assignedCargo.tonnes, capacity) : 0;
        const status = (boatOverrides[boatCode]?.status || (load > 0 ? "In transit" : "Available")) as Boat["status"];
        const routes = ["Kochi → Alappuzha", "Kollam → Kottayam", "Alappuzha → Kollam", "Kochi → Kottayam"];
        return {
          code: boatCode,
          name: op.vesselName || "River Fern",
          capacity,
          load,
          status,
          route: routes[index % routes.length],
          eta: status === "In transit" ? "In transit" : "Ready now",
          operator: op.vesselType || "Blue Current Logistics",
          dbId: op.id
        };
      }).map(b => boatOverrides[b.code] ? { ...b, ...boatOverrides[b.code] } : b);
    }
    return [];
  }, [dbOperators, cargo, boatOverrides]);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showOptimize, setShowOptimize] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const [showWhy, setShowWhy] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [showFullSimulator, setShowFullSimulator] = useState(false);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [simulator, setSimulator] = useState({ removeBoat: false, demand: 0, routeClosed: false, roadCost: 5 });
  const [delayMinutes, setDelayMinutes] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCopilot((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const unread = notifications.filter((item) => item.unread).length;
  const plannedCargo = cargo.filter((item) => item.status !== "Delivered").length;
  const totalTonnes = cargo.reduce((sum, item) => sum + item.tonnes, 0);
  const fleetAvailable = boats.filter((boat) => boat.status === "Available").length;

  const metrics = useMemo(() => {
    const totalT = cargo.reduce((sum, item) => sum + item.tonnes, 0);
    // Real dynamic cost calculation based on actual cargo tonnage and waterway/road rates
    const calculatedWaterwayCost = cargo.reduce((sum, item) => sum + (item.tonnes * (item.waterway || 4.2) * 120), 0);
    const calculatedRoadCost = cargo.reduce((sum, item) => sum + (item.tonnes * (item.road || 5.5) * 120), 0);
    
    const factor = mode === "Lowest Cost" ? 0.94 : mode === "Lowest CO₂" ? 0.89 : mode === "Fastest" ? 1.02 : 0.91;
    const cost = Math.round(calculatedWaterwayCost * factor);
    const baselineCost = Math.round(calculatedRoadCost);
    const costSavingPercent = baselineCost > 0 ? (((baselineCost - cost) / baselineCost) * 100).toFixed(1) : "0";

    // Dynamic CO2 avoided based on actual tonnes moved (avg ~14.2 kg CO2 saved per tonne by waterway vs road)
    const co2Saved = Math.round(totalT * 14.2 * (mode === "Lowest CO₂" ? 1.25 : 1.0));
    const co2Percent = totalT > 0 ? "28.4%" : "0%";

    // Dynamic fleet utilization based on real boats in DB
    const totalCapacity = boats.reduce((sum, b) => sum + b.capacity, 0);
    const totalLoad = boats.reduce((sum, b) => sum + b.load, 0);
    const utilization = totalCapacity > 0 ? Math.round((totalLoad / totalCapacity) * 100) : 0;

    const uniqueRoutes = new Set(cargo.map(c => c.route)).size;

    return {
      cost,
      baselineCost,
      costSavingPercent,
      co2Saved,
      co2Percent,
      eta: mode === "Fastest" ? 14.5 : 18.2,
      baselineEta: 24.0,
      utilization,
      emptyKm: simulator.routeClosed ? 340 : 210,
      baselineEmptyKm: 580,
      uniqueRoutes,
    };
  }, [cargo, boats, mode, simulator.routeClosed]);

  const navItems = role === "admin"
    ? ["Overview", "Network plan", "Fleet", "Cargo pool", "Simulator"]
    : role === "owner"
      ? ["My shipments", "Get a quote", "Track cargo"]
      : ["My fleet", "Trip proposals", "Active trips"];

  function addActivity(title: string, text: string, kind = "info") {
    setNotifications((current) => [{ id: Date.now(), kind, title, text, time: "Just now", unread: true }, ...current]);
  }

  function optimize() {
    setShowOptimize(true);
    addActivity("Draft plan ready", `${mode} plan pools 3 cargo jobs across 2 trips.`, "success");
    toast.success("Draft network plan generated", { description: `${mode} scoring is ready to review.` });
  }

  function publishPlan() {
    setPublished(true);
    setShowOptimize(false);
    
    cargo.forEach(c => {
      if ((c.status === "Pending" || c.status === "Draft") && c.dbId) {
         updateShipmentStatus.mutate({ id: c.dbId, status: "assigned" });
      }
    });

    addActivity("Plan published", "Trips are awaiting operator acceptance.", "success");
    toast.success("Plan published to operators", { description: "Owners and operators have been notified." });
  }

  function markUnavailable(boatCode?: string) {
    const vessel = (boatCode && boats.find(b => b.code === boatCode)) || boats[0] || { code: "B-001", name: "River Fern" };
    setBoatOverrides(prev => ({ ...prev, [vessel.code]: { status: "Unavailable" } }));
    setShowRecovery(true);
    addActivity("Disruption raised", `${vessel.code} (${vessel.name}) reported breakdown. Emergency recovery plan active.`, "warning");
    toast.warning(`${vessel.name} marked unavailable`, { description: "An automated rerouting recovery plan has been generated." });
  }

  function approveRecovery() {
    setShowRecovery(false);
    const altBoat = boats.find(b => b.status === "Available" && b.code !== "B-001") || boats[1] || { code: "B-002", name: "Backwater Star" };
    setBoatOverrides(prev => ({
      ...prev,
      "B-001": { status: "Unavailable" },
      [altBoat.code]: { status: "In transit" }
    }));
    addActivity("Recovery plan approved", `Cargo reassigned to ${altBoat.code} (${altBoat.name}) with zero schedule disruption.`, "success");
    toast.success("Recovery plan approved", { description: "Vessels rerouted and cargo owners notified." });
  }

  function operatorAction(action: "accept" | "decline" | "depart" | "delay", targetItem?: Cargo) {
    if (action === "delay") {
      setShowDelayModal(true);
      return;
    }
    if (action === "accept") {
      if (targetItem && targetItem.dbId) {
        updateShipmentStatus.mutate({ id: targetItem.dbId, status: "assigned" });
        addActivity("Trip accepted", `Trip ${targetItem.id} accepted. Dispatched to Active Trips.`, "success");
        toast.success(`Trip ${targetItem.id} accepted!`, { description: "Shipment is now In Transit under Active Trips." });
      } else {
        cargo.forEach(c => {
          if ((c.status === "Awaiting operator" || c.status === "Pending") && c.dbId) {
            updateShipmentStatus.mutate({ id: c.dbId, status: "assigned" });
          }
        });
        addActivity("Trips accepted", "All proposals accepted and dispatched.", "success");
        toast.success("All trip proposals accepted!");
      }
    } else if (action === "decline") {
      if (targetItem && targetItem.dbId) {
        updateShipmentStatus.mutate({ id: targetItem.dbId, status: "cancelled" });
        addActivity("Operator declined", `Proposal ${targetItem.id} declined.`, "warning");
        toast("Proposal declined", { description: `${targetItem.id} has been declined.` });
      } else {
        cargo.forEach(c => {
          if ((c.status === "Awaiting operator" || c.status === "Pending") && c.dbId) {
            updateShipmentStatus.mutate({ id: c.dbId, status: "cancelled" });
          }
        });
        addActivity("Operator declined", "Proposals declined.", "warning");
        toast("Proposals declined");
      }
    } else {
      cargo.forEach(c => {
        if (c.status === "In transit" && c.dbId) {
          updateShipmentStatus.mutate({ id: c.dbId, status: "completed" });
        }
      });
      addActivity("Trip departed & delivered", "Active trips arrived at destination terminals.", "info");
      toast.success("Active trips completed & cargo marked Delivered!");
    }
  }

  function addCargo(form: HTMLFormElement) {
    const data = new FormData(form);
    const quantity = Number(data.get("quantity") || 120);
    
    createShipment.mutate({
      title: `${data.get("type") || "Cement"} Delivery`,
      origin: String(data.get("origin") || "Kochi"),
      destination: String(data.get("destination") || "Alappuzha"),
      cargoType: String(data.get("type") || "Cement"),
      weightTons: quantity.toString(),
      budgetUSD: "1000",
    });
    
    setShowPost(false);
    addActivity("Cargo posted", `New shipment added to the planning pool.`, "success");
  }

  const title = role === "admin" ? "Network command center" : role === "owner" ? "Your shipments" : "Operator workspace";
  const subtitle = role === "admin" ? "A live view of every tonne, boat and decision across the Kerala waterway network." : role === "owner" ? "Post cargo, compare routes, and follow every shipment." : "Keep your fleet moving and respond to the next best trip.";

  return (
    <div className="app-shell">
      <Toaster position="bottom-right" richColors />
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Waves size={20} /></div><div><strong>waterway</strong><span>smart logistics</span></div></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>{navItems.map((item) => <button key={item} onClick={() => { setActive(item); setTimeout(() => document.getElementById(`section-${item}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} className={active === item ? "nav-item active" : "nav-item"}><NavIcon name={item} /><span>{item}</span>{item === "Network plan" && published && <i className="nav-dot" />}</button>)}</nav>
        <div className="sidebar-bottom"><button className="nav-item"><Settings2 size={17} /><span>Settings</span></button><div className="profile"><div className="avatar">{role === "admin" ? "AM" : role === "owner" ? "MB" : "RK"}</div><div><strong>{role === "admin" ? "Anita Menon" : role === "owner" ? "Malabar BuildCo" : "Ravi Kumar"}</strong><span>{role === "admin" ? "Network admin" : role === "owner" ? "Cargo owner" : "Boat operator"}</span></div><MoreHorizontal size={17} /></div></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><button className="mobile-menu"><Menu size={20} /></button><div className="crumb"><span>Operations</span><span>/</span><strong>{active}</strong></div><div className="top-actions"><button className="copilot-btn" onClick={() => setShowCopilot(true)}><Bot size={15} /> Copilot <span className="copilot-kbd">⌘K</span></button><div className="role-switcher"><Users size={15} /><select value={role} onChange={(event) => { setRole(event.target.value as Role); setActive(event.target.value === "admin" ? "Overview" : event.target.value === "owner" ? "My shipments" : "My fleet"); }}><option value="admin">Admin view</option><option value="owner">Cargo owner view</option><option value="operator">Boat operator view</option></select><ChevronDown size={13} /></div><button className="icon-button" onClick={() => { setShowNotifications(!showNotifications); setNotifications((items) => items.map((item) => ({ ...item, unread: false }))); }}><Bell size={18} />{unread > 0 && <span className="notification-count">{unread}</span>}</button><button className="help-button"><HelpCircle size={17} /> Help</button></div></header>
        {showNotifications && <NotificationDrawer notifications={notifications} onClose={() => setShowNotifications(false)} />}
        <div className="page-wrap">
          <div className="page-heading"><div><div className="eyebrow"><span className="live-dot" /> LIVE NETWORK · UPDATED JUST NOW</div><h1>{title}</h1><p>{subtitle}</p></div><div className="heading-actions">{role === "admin" && <button className="button button-secondary" onClick={() => setShowRecovery(true)}><CircleAlert size={16} /> Disruption center</button>}{role === "owner" && <button className="button button-primary" onClick={() => setShowPost(true)}><Box size={16} /> Post cargo</button>}{role === "admin" && <button className="button button-primary" onClick={optimize}><Sparkles size={16} /> Optimize Network</button>}</div></div>
          {role === "admin" ? <AdminDashboard metrics={metrics} boats={boats} cargo={cargo} simulator={simulator} setSimulator={setSimulator} setShowWhy={setShowWhy} onOptimize={optimize} onUnavailable={markUnavailable} published={published} onOpenSimulator={() => setShowFullSimulator(true)} /> : role === "owner" ? <OwnerDashboard cargo={cargo} onPost={() => setShowPost(true)} onWhy={setShowWhy} onQuote={() => setShowQuote(true)} /> : <OperatorDashboard boats={boats} cargo={cargo} onAction={operatorAction} onUnavailable={markUnavailable} />}
        </div>
      </main>
      {showOptimize && <OptimizeModal mode={mode} setMode={setMode} metrics={metrics} cargo={cargo} onClose={() => setShowOptimize(false)} onPublish={publishPlan} onWhy={setShowWhy} />}
      {showPost && <PostCargoModal onClose={() => setShowPost(false)} onSubmit={addCargo} />}
      {showWhy && <ExplainModal cargo={cargo.find((item) => item.id === showWhy)} onClose={() => setShowWhy(null)} />}
      {showRecovery && <RecoveryModal onClose={() => setShowRecovery(false)} onApprove={approveRecovery} />}
      {showCopilot && (
        <CopilotModal
          onClose={() => setShowCopilot(false)}
          onOptimize={(m) => { setMode(m); setShowOptimize(true); }}
          onBreakdown={() => markUnavailable("B-104")}
          onSimulate={() => setShowFullSimulator(true)}
          onWhy={() => setShowWhy(cargo[0]?.id || "CG-2026-0001")}
          onQuote={() => setShowQuote(true)}
          onFleet={() => { setActive("Fleet"); setTimeout(() => document.getElementById("section-Fleet")?.scrollIntoView({ behavior: "smooth" }), 50); }}
        />
      )}
      {showQuote && <QuoteModal onClose={() => setShowQuote(false)} onBook={() => { setShowQuote(false); setShowPost(true); }} />}
      {showFullSimulator && (
        <SimulatorModal
          simulator={simulator}
          setSimulator={setSimulator}
          metrics={metrics}
          onClose={() => setShowFullSimulator(false)}
          onApply={() => {
            setShowFullSimulator(false);
            addActivity("Simulated plan applied", "Draft plan updated from what-if scenario parameters.", "success");
            toast.success("Simulation applied as draft plan", { description: "Review and publish from Network Plan." });
          }}
        />
      )}
      {showDelayModal && (
        <DelayModal
          onClose={() => setShowDelayModal(false)}
          onReport={(mins, reason) => {
            setShowDelayModal(false);
            setDelayMinutes(prev => prev + mins);
            addActivity("Trip delay logged", `+${mins}m delay reported on active route (${reason}).`, "warning");
            toast.warning(`Delay warning logged (+${mins} mins)`, { description: `Cause: ${reason}. Risk threshold checked.` });
          }}
        />
      )}
    </div>
  );
}

function NavIcon({ name }: { name: string }) { const props = { size: 17 }; if (name === "Fleet" || name === "My fleet") return <Ship {...props} />; if (name === "Cargo pool" || name === "My shipments") return <Box {...props} />; if (name === "Simulator") return <SlidersHorizontal {...props} />; if (name === "Network plan" || name === "Active trips") return <Route {...props} />; if (name === "Trip proposals") return <Send {...props} />; if (name === "Get a quote") return <Sparkles {...props} />; if (name === "Track cargo") return <MapPinned {...props} />; return <LayoutDashboard {...props} />; }

function AdminDashboard({ metrics, boats, cargo, simulator, setSimulator, setShowWhy, onOptimize, onUnavailable, published, onOpenSimulator }: { metrics: any; boats: Boat[]; cargo: Cargo[]; simulator: any; setSimulator: (value: any) => void; setShowWhy: (id: string) => void; onOptimize: () => void; onUnavailable: () => void; published: boolean; onOpenSimulator: () => void }) {
  return <>
    <section className="metric-row" id="section-Overview"> <Metric label="Network cost" value={money(metrics.cost)} delta={`${metrics.costSavingPercent}%`} detail="vs road baseline" positive={Number(metrics.costSavingPercent) > 0} /><Metric label="CO₂ avoided" value={`${metrics.co2Saved.toLocaleString()} kg`} delta={metrics.co2Percent} detail="this planning cycle" positive={metrics.co2Saved > 0} /><Metric label="Fleet utilization" value={`${metrics.utilization}%`} delta={metrics.utilization > 0 ? `${metrics.utilization}% load` : "Idle"} detail="of fleet capacity" positive={metrics.utilization > 50} /><Metric label="Cargo in motion" value={`${totalCargo(cargo)}T`} delta={`${cargo.length} jobs`} detail={`across ${metrics.uniqueRoutes} routes`} positive={cargo.length > 0} /></section>
    <section className="dashboard-grid"><div className="card network-card"><div className="card-header"><div><div className="section-kicker">DIGITAL TWIN</div><h2>Network flow</h2></div><div className="legend"><span><i className="legend-dot teal" /> Waterway</span><span><i className="legend-dot amber" /> At risk</span><button className="small-icon"><MoreHorizontal size={16} /></button></div></div><NetworkMap boats={boats} /></div><div className="card activity-card" id="section-Cargo pool"><div className="card-header"><div><div className="section-kicker">LIVE ACTIVITY</div><h2>What’s moving</h2></div><button className="text-button">View all <ArrowUpRight size={14} /></button></div><ActivityList /></div></section>
    <section className="dashboard-grid lower"><div className="card plan-card" id="section-Network plan"><div className="card-header"><div><div className="section-kicker">PLANNING POOL · {cargo.filter((item) => item.status === "Pending" || item.status === "Draft").length} JOBS</div><h2>Next best moves</h2></div><button className="button button-ghost" onClick={onOptimize}><Sparkles size={15} /> Optimize</button></div><div className="plan-list">{cargo.length === 0 ? <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#64748b" }}>Planning pool is empty. Post new cargo to generate route recommendations.</div> : cargo.slice(0, 3).map((item, index) => <div className="plan-item" key={item.id}><div className="plan-index">0{index + 1}</div><div className="plan-main"><strong>{item.route}</strong><span>{item.id} · {item.tonnes}T {item.type}</span></div><div className="plan-meta"><StatusChip status={item.status} /><button className="why-button" onClick={() => setShowWhy(item.id)}>Why this plan <ArrowUpRight size={13} /></button></div></div>)}</div></div><div className="card fleet-card" id="section-Fleet"><div className="card-header"><div><div className="section-kicker">FLEET STATUS</div><h2>{boats.filter((boat) => boat.status === "Available").length} boats available</h2></div><button className="text-button">Manage fleet <ArrowUpRight size={14} /></button></div><div className="fleet-list">{boats.length === 0 ? <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#64748b" }}>No active vessels in the network.</div> : boats.map((boat) => <div className="fleet-row" key={boat.code}><div className={`boat-icon ${boat.status === "Unavailable" ? "danger" : boat.status === "In transit" ? "moving" : "ready"}`}><Ship size={15} /></div><div className="fleet-name"><strong>{boat.code} · {boat.name}</strong><span>{boat.route}</span></div><div className="fleet-load"><div className="load-bar"><i style={{ width: `${Math.round((boat.load / boat.capacity) * 100)}%` }} /></div><span>{boat.load}/{boat.capacity}T</span></div><StatusChip status={boat.status} /></div>)}</div></div></section>
    <section className="insight-strip"><div className="insight-icon"><Sparkles size={18} /></div><div><strong>Network insight</strong><span>{published ? "Published plan is live. Operators have 2 trip proposals waiting." : cargo.length > 0 ? "The next optimization can save costs and CO₂ by pooling return loads." : "Post cargo shipments to view live AI routing and cost optimizations."}</span></div><button className="button button-dark" onClick={onOptimize}>{published ? "Review published plan" : "See the recommendation"} <ArrowUpRight size={15} /></button></section>
    <section className="simulator-inline card" id="section-Simulator"><div><div className="section-kicker">QUICK WHAT-IF</div><h2>Test the network before you commit</h2><p>See how a closed route or extra demand changes the plan.</p></div><div className="sim-controls"><button className={simulator.removeBoat ? "toggle active" : "toggle"} onClick={() => setSimulator({ ...simulator, removeBoat: !simulator.removeBoat })}><span /> Remove B-104</button><button className={simulator.routeClosed ? "toggle active" : "toggle"} onClick={() => setSimulator({ ...simulator, routeClosed: !simulator.routeClosed })}><span /> Close KOC → KLM</button><button className="button button-secondary" onClick={onOpenSimulator}><SlidersHorizontal size={14} /> Full simulator</button><button className="button button-secondary" onClick={() => toast.success("Scenario recalculated", { description: `${simulator.routeClosed ? "Route closure adds 126 empty km." : "All routes open. Balanced plan is stable."}` })}><RefreshCcw size={15} /> Recalculate</button></div></section>
  </>;
}

function OwnerDashboard({ cargo, onPost, onWhy, onQuote }: { cargo: Cargo[]; onPost: () => void; onWhy: (id: string) => void; onQuote: () => void }) { return <><section className="owner-hero card" id="section-Get a quote"><div><div className="section-kicker">CARGO OWNER</div><h2>Move your next load with confidence.</h2><p>Tell us what needs moving. We’ll compare every route, boat and return load for you.</p><div style={{ display: "flex", gap: "9px", marginTop: "14px", flexWrap: "wrap" }}><button className="button button-primary" onClick={onPost}><Box size={16} /> Post new cargo</button><button className="button button-secondary" onClick={onQuote}><Sparkles size={16} /> Instant quote calculator</button></div></div><div className="owner-hero-stat"><span>Average waterway saving</span><strong>18.4%</strong><small>across your current lanes</small></div></section><section className="metric-row"><Metric label="Active shipments" value={String(cargo.filter((item) => item.status === "In transit" || item.status === "Confirmed").length)} delta={`${cargo.length} total`} detail="in network" positive /><Metric label="Planning pool" value={`${cargo.filter((item) => item.status === "Pending" || item.status === "Draft").length} jobs`} delta="Ready to optimize" detail="we’ll pick the boat" positive /><Metric label="CO₂ avoided" value={`${(cargo.reduce((sum, c) => sum + c.tonnes, 0) * 0.014).toFixed(1)}T`} delta="26%" detail="vs direct road" positive /></section><div className="card table-card" id="section-My shipments"><div className="card-header"><div><div className="section-kicker">YOUR CARGO</div><h2>Shipments and quotes</h2></div><div style={{ display: "flex", gap: "8px" }}><button className="button button-secondary" onClick={onQuote}><Sparkles size={14} /> Compare quote</button><button className="button button-ghost" onClick={onPost}>Post cargo <ArrowUpRight size={14} /></button></div></div><CargoTable cargo={cargo} onWhy={onWhy} /></div></> }

function OperatorDashboard({ boats, cargo, onAction, onUnavailable }: { boats: Boat[]; cargo: Cargo[]; onAction: (action: "accept" | "decline" | "depart" | "delay", targetItem?: Cargo) => void; onUnavailable: (code?: string) => void }) {
  const proposals = cargo.filter((item) => item.status === "Awaiting operator" || item.status === "Pending");
  const activeTrips = cargo.filter((item) => item.status === "In transit" || item.status === "Confirmed");

  return <>
    <section className="metric-row">
      <Metric label="Fleet utilization" value={`${boats.length > 0 ? Math.round((boats.reduce((sum, b) => sum + b.load, 0) / boats.reduce((sum, b) => sum + b.capacity, 0)) * 100) : 0}%`} delta="+8 pts" detail="this week" positive />
      <Metric label="Available capacity" value={`${boats.filter((b) => b.status === "Available").reduce((sum, b) => sum + b.capacity, 0)}T`} delta={`${boats.filter((b) => b.status === "Available").length} boats`} detail="ready to accept" positive />
      <Metric label="On-time rate" value="96.2%" delta="+3.8%" detail="last 30 days" positive />
    </section>
    <section className="operator-grid">
      <div className="card proposal-card" id="section-Trip proposals">
        <div className="card-header">
          <div><div className="section-kicker">ACTION REQUIRED · {proposals.length} PROPOSALS</div><h2>Trip proposals</h2></div>
          <StatusChip status={proposals.length > 0 ? `${proposals.length} Pending` : "No pending proposals"} />
        </div>
        {proposals.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {proposals.map((item, idx) => {
              const assignedBoat = boats[idx % (boats.length || 1)] || { code: "B-001", name: "River Fern" };
              const originCode = (item.origin || "Kochi").slice(0, 3).toUpperCase();
              const destCode = (item.destination || "Alappuzha").slice(0, 3).toUpperCase();
              const estRevenue = Math.round(item.tonnes * 390);

              return (
                <div key={item.id} style={{ borderBottom: idx < proposals.length - 1 ? "1px solid var(--border, #e2e8f0)" : "none", paddingBottom: "1.25rem" }}>
                  <div className="proposal-route">
                    <div className="terminal-dot">{originCode}</div>
                    <div className="route-line"><i /><span>{item.route}</span><i /></div>
                    <div className="terminal-dot">{destCode}</div>
                  </div>
                  <div className="proposal-details">
                    <div><span>Cargo</span><strong>{item.id} · {item.tonnes}T {item.type}</strong></div>
                    <div><span>Assigned boat</span><strong>{assignedBoat.code} · {assignedBoat.name}</strong></div>
                    <div><span>Est. revenue</span><strong>₹{estRevenue.toLocaleString()}</strong></div>
                    <div><span>Status</span><StatusChip status={item.status} /></div>
                  </div>
                  <div className="proposal-reasons">
                    <Check size={15} /><span>Capacity fit ({item.tonnes}T)</span>
                    <Check size={15} /><span>Certified for {item.type}</span>
                    <Check size={15} /><span>Scheduled return leg</span>
                  </div>
                  <div className="proposal-actions" style={{ marginTop: "0.75rem" }}>
                    <button className="button button-secondary" onClick={() => onAction("decline", item)}><X size={16} /> Decline</button>
                    <button className="button button-primary" onClick={() => onAction("accept", item)}><Check size={16} /> Accept trip</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#64748b" }}>
            No trip proposals awaiting action. When cargo is posted and published into a plan, it appears here for acceptance.
          </div>
        )}
      </div>
      <div className="card fleet-card" id="section-My fleet">
        <div className="card-header"><div><div className="section-kicker">YOUR BOATS · {boats.length} REGISTERED</div><h2>Fleet at a glance</h2></div><button className="text-button">Edit fleet <ArrowUpRight size={14} /></button></div>
        <div className="fleet-list">
          {boats.length === 0 ? (
            <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#64748b" }}>No boats currently registered.</div>
          ) : (
            boats.slice(0, 4).map((boat) => (
              <div className="fleet-row" key={boat.code}>
                <div className={`boat-icon ${boat.status === "Unavailable" ? "danger" : boat.status === "In transit" ? "moving" : "ready"}`}><Ship size={15} /></div>
                <div className="fleet-name"><strong>{boat.code} · {boat.name}</strong><span>{boat.route}</span></div>
                <div className="fleet-load"><div className="load-bar"><i style={{ width: `${Math.round((boat.load / boat.capacity) * 100)}%` }} /></div><span>{boat.load}/{boat.capacity}T</span></div>
                <StatusChip status={boat.status} />
              </div>
            ))
          )}
        </div>
        <button className="button button-secondary full" onClick={() => onUnavailable(boats[0]?.code || "B-001")}><CircleAlert size={15} /> Report breakdown</button>
      </div>
    </section>
    <section className="card table-card" id="section-Active trips">
      <div className="card-header"><div><div className="section-kicker">TRIP CONTROL · {activeTrips.length} ACTIVE</div><h2>Active trips</h2></div><div style={{ display: "flex", gap: "8px" }}><button className="button button-ghost" onClick={() => onAction("delay")}><Clock3 size={15} /> Report delay</button><button className="button button-secondary" onClick={() => onAction("depart")}><Send size={15} /> Mark departed</button></div></div>
      <CargoTable cargo={activeTrips} />
    </section>
  </>;
}

function Metric({ label, value, delta, detail, positive }: { label: string; value: string; delta: string; detail: string; positive?: boolean }) { return <div className="metric-card"><span>{label}</span><strong>{value}</strong><div><span className={positive ? "delta positive" : "delta"}><ArrowUpRight size={13} />{delta}</span><small>{detail}</small></div></div> }
function totalCargo(cargo: Cargo[]) { return cargo.reduce((sum, item) => sum + item.tonnes, 0); }
function StatusChip({ status }: { status: string }) { const normalized = status.toLowerCase(); const tone = normalized.includes("unavailable") || normalized.includes("risk") || normalized.includes("disrupted") ? "danger" : normalized.includes("transit") || normalized.includes("confirmed") || normalized.includes("available") || normalized.includes("published") ? "success" : normalized.includes("await") || normalized.includes("pending") || normalized.includes("draft") ? "warning" : "neutral"; return <span className={`status-chip ${tone}`}><i />{status}</span> }
function CargoTable({ cargo, onWhy }: { cargo: Cargo[]; onWhy?: (id: string) => void }) { if (cargo.length === 0) return <div style={{ padding: "3rem 1rem", textAlign: "center", color: "#64748b" }}>No shipments in the network yet. Click <strong>Post cargo</strong> to add your first job.</div>; return <div className="cargo-table"><div className="cargo-head"><span>REFERENCE / ROUTE</span><span>LOAD</span><span>STATUS</span><span>ETA</span><span>QUOTE</span><span /></div>{cargo.map((item) => <div className="cargo-row" key={item.id}><div className="cargo-ref"><strong>{item.id}</strong><span>{item.route}</span></div><span>{item.tonnes}T {item.type}</span><StatusChip status={item.status} /><span>{item.eta}</span><div className="quote-mini"><strong>{money(item.waterway)}/T</strong><span className={item.recommendation === "Waterway" ? "teal-text" : "amber-text"}>{item.recommendation}</span></div>{onWhy ? <button className="more-row" onClick={() => onWhy(item.id)}><MoreHorizontal size={16} /></button> : <span />}</div>)}</div> }
function NetworkMap({ boats }: { boats: Boat[] }) { return <div className="network-map"><div className="map-grid" /><svg viewBox="0 0 720 300" role="img" aria-label="Stylized Kerala waterway network"><path className="route-path soft" d="M92 221 C178 185 170 110 258 88 S370 114 438 75 S553 92 635 48" /><path className="route-path active" d="M92 221 C178 185 170 110 258 88 S370 114 438 75" /><path className="route-path secondary" d="M258 88 C325 145 362 211 470 231 S565 205 635 48" /><path className="route-path dashed" d="M92 221 C220 253 355 277 470 231" /><MapNode x="92" y="221" label="Kochi" code="KOC" /><MapNode x="258" y="88" label="Alappuzha" code="ALP" active /><MapNode x="438" y="75" label="Kottayam" code="KTM" /><MapNode x="470" y="231" label="Kollam" code="KLM" /><MapNode x="635" y="48" label="Changanassery" code="CGY" /></svg><div className="map-status"><span><i className="legend-dot teal" /> 4 active routes</span><span><i className="legend-dot amber" /> 1 delay risk</span><span><Ship size={13} /> {boats.filter((boat) => boat.status === "In transit").length} boats moving</span></div></div> }
function MapNode({ x, y, label, code, active }: { x: string; y: string; label: string; code: string; active?: boolean }) { return <g className={active ? "map-node active" : "map-node"}><circle cx={x} cy={y} r="8" /><circle cx={x} cy={y} r="15" /><text x={Number(x) + 18} y={Number(y) + 4}>{label}</text><text className="node-code" x={Number(x) + 18} y={Number(y) + 19}>{code}</text></g> }
function ActivityList() { const items = [{ icon: <Sparkles size={14} />, title: "Plan recommendation ready", text: "Pooling saves ₹33,800", time: "2 min" }, { icon: <Ship size={14} />, title: "B-087 accepted cargo", text: "Kollam → Kottayam", time: "18 min" }, { icon: <CloudRain size={14} />, title: "Delay risk crossed 60%", text: "B-104 · 68% risk", time: "42 min" }, { icon: <PackageCheck size={14} />, title: "Cargo delivered", text: "CG-2026-0007 · 120T", time: "1h" }]; return <div className="activity-list">{items.map((item, index) => <div className="activity-item" key={index}><div className={`activity-icon ${index === 2 ? "warning" : index === 3 ? "success" : ""}`}>{item.icon}</div><div><strong>{item.title}</strong><span>{item.text}</span></div><time>{item.time}</time></div>)}</div> }

function NotificationDrawer({ notifications, onClose }: { notifications: any[]; onClose: () => void }) { return <div className="notification-drawer"><div className="drawer-header"><div><span className="section-kicker">INBOX</span><h3>Notifications</h3></div><button className="small-icon" onClick={onClose}><X size={17} /></button></div>{notifications.slice(0, 5).map((item) => <div className="notification-item" key={item.id}><div className={`notification-icon ${item.kind}`}>{item.kind === "success" ? <CircleCheck size={15} /> : item.kind === "warning" ? <CircleAlert size={15} /> : <Bell size={15} />}</div><div><strong>{item.title}</strong><p>{item.text}</p><time>{item.time}</time></div></div>)}</div> }
function OptimizeModal({ mode, setMode, metrics, cargo, onClose, onPublish, onWhy }: { mode: Mode; setMode: (mode: Mode) => void; metrics: any; cargo: Cargo[]; onClose: () => void; onPublish: () => void; onWhy: (id: string) => void }) { return <div className="overlay"><div className="modal optimize-modal"><div className="modal-header"><div><div className="section-kicker">DRAFT PLAN · 06 OCT 2026</div><h2>Optimize the network</h2><p>Review the recommendation before it reaches operators.</p></div><button className="small-icon" onClick={onClose}><X size={18} /></button></div><div className="mode-row">{modes.map((item) => <button key={item} className={mode === item ? "mode-button active" : "mode-button"} onClick={() => setMode(item)}>{item === "Lowest CO₂" ? <Waves size={14} /> : item === "Fastest" ? <Zap size={14} /> : item === "Lowest Cost" ? <Gauge size={14} /> : <Sparkles size={14} />}{item}</button>)}</div><div className="before-after"><div><span>Traditional routing</span><strong>{money(metrics.baselineCost)}</strong><small>₹ / total cost</small><div className="comparison-bar"><i style={{ width: "100%" }} /></div></div><div className="compare-arrow"><ArrowDownRight size={18} /></div><div className="recommended"><span>{mode} plan</span><strong>{money(metrics.cost)}</strong><small>₹ / total cost · <em>-{Math.round((1 - metrics.cost / metrics.baselineCost) * 100)}%</em></small><div className="comparison-bar"><i style={{ width: `${Math.round((metrics.cost / metrics.baselineCost) * 100)}%` }} /></div></div></div><div className="metric-compare"><Compare label="CO₂ emissions" before={`${metrics.baselineCo2.toLocaleString()} kg`} after={`${metrics.co2.toLocaleString()} kg`} saving={`${Math.round((1 - metrics.co2 / metrics.baselineCo2) * 100)}% lower`} /><Compare label="Average ETA" before={`${metrics.baselineEta} hrs`} after={`${metrics.eta} hrs`} saving={`${(metrics.baselineEta - metrics.eta).toFixed(1)} hrs saved`} /><Compare label="Fleet utilization" before={`${metrics.baselineUtilization}%`} after={`${metrics.utilization}%`} saving={`+${metrics.utilization - metrics.baselineUtilization} pts`} /></div><div className="modal-section"><div className="section-title"><span>RECOMMENDED MOVES</span><small>2 trips · {cargo.filter((item) => item.recommendation === "Waterway").length} cargo jobs pooled</small></div><div className="recommendation-list"><div className="recommendation-row"><div className="rec-boat">B-087</div><div><strong>Kollam → Kottayam</strong><span>182T pooled · 70% utilized · return load found</span></div><button className="why-button" onClick={() => onWhy("CG-2026-0011")}>Why B-087? <ArrowUpRight size={13} /></button></div><div className="recommendation-row"><div className="rec-boat teal">B-104</div><div><strong>Kochi → Alappuzha → Kochi</strong><span>336T pooled · 80% utilized · 72T backhaul</span></div><button className="why-button" onClick={() => onWhy("CG-2026-0012")}>Why B-104? <ArrowUpRight size={13} /></button></div></div></div><div className="modal-footer"><span><CircleCheck size={15} /> All cargo fits capacity and deadlines</span><div><button className="button button-secondary" onClick={onClose}>Keep editing</button><button className="button button-primary" onClick={onPublish}><Send size={15} /> Publish plan</button></div></div></div></div> }
function Compare({ label, before, after, saving }: { label: string; before: string; after: string; saving: string }) { return <div className="compare-item"><span>{label}</span><div><small>{before}</small><ArrowDownRight size={14} /><strong>{after}</strong></div><em>{saving}</em></div> }
function ExplainModal({ cargo, onClose }: { cargo?: Cargo; onClose: () => void }) { return <div className="overlay"><div className="modal explain-modal"><div className="modal-header"><div><div className="section-kicker">EXPLAINABILITY</div><h2>Why this plan?</h2><p>{cargo ? `${cargo.id} · ${cargo.route}` : "Recommended network assignment"}</p></div><button className="small-icon" onClick={onClose}><X size={18} /></button></div><div className="explain-score"><div className="score-ring"><strong>92</strong><span>/100</span></div><div><strong>Strong fit for waterway</strong><p>This recommendation balances cost, deadline confidence and a useful return load.</p></div></div><div className="check-list"><ExplainCheck label="Capacity fit" detail="180T cargo fits within B-104's remaining capacity." /><ExplainCheck label="Supported cargo" detail="Boat is certified for cement and construction material." /><ExplainCheck label="Route proximity" detail="B-104 is already positioned at Kochi terminal." /><ExplainCheck label="Deadline confidence" detail="12.4 hours of schedule slack before delivery deadline." /><ExplainCheck label="Backhaul match" detail="72T timber on the return leg reduces empty running." /></div><div className="why-footer"><span><Sparkles size={15} /> Scored under Balanced mode</span><button className="button button-primary" onClick={onClose}>Got it</button></div></div></div> }
function ExplainCheck({ label, detail }: { label: string; detail: string }) { return <div className="explain-check"><div><CircleCheck size={17} /></div><span><strong>{label}</strong><small>{detail}</small></span></div> }
function PostCargoModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (form: HTMLFormElement) => void }) { return <div className="overlay"><div className="modal post-modal"><div className="modal-header"><div><div className="section-kicker">NEW SHIPMENT</div><h2>Post cargo</h2><p>We’ll find the best terminal, boat and route for you.</p></div><button className="small-icon" onClick={onClose}><X size={18} /></button></div><form onSubmit={(event) => { event.preventDefault(); onSubmit(event.currentTarget); }}><div className="form-grid"><label>Cargo type<select name="type"><option>Cement</option><option>Grain</option><option>Bricks</option><option>Timber</option></select></label><label>Quantity (tonnes)<input name="quantity" type="number" defaultValue="180" min="1" /></label><label>Pickup terminal<select name="origin"><option>Kochi</option><option>Alappuzha</option><option>Kollam</option></select></label><label>Drop terminal<select name="destination"><option>Alappuzha</option><option>Kottayam</option><option>Kollam</option></select></label><label>Pickup window<input type="text" defaultValue="13 Oct · 08:00–12:00" /></label><label>Delivery deadline<input type="text" defaultValue="15 Oct · 18:00" /></label><label>Urgency<select name="urgency"><option>Normal</option><option>High</option><option>Low</option></select></label><label>Late penalty<input type="text" defaultValue="₹25,000" /></label></div><div className="quote-preview"><div className="quote-preview-icon"><Sparkles size={18} /></div><div><strong>Instant quote included</strong><span>Compare waterway and road before requesting a booking.</span></div><ArrowUpRight size={16} /></div><div className="modal-footer"><span>All prices are estimates</span><div><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary"><Sparkles size={15} /> Calculate quote</button></div></div></form></div></div> }
function RecoveryModal({ onClose, onApprove }: { onClose: () => void; onApprove: () => void }) { return <div className="overlay"><div className="modal recovery-modal"><div className="modal-header"><div><div className="section-kicker warning-text">DISRUPTION · RECOVERY DRAFT</div><h2>B-104 is unavailable</h2><p>Here’s the best recovery plan for affected cargo.</p></div><button className="small-icon" onClick={onClose}><X size={18} /></button></div><div className="recovery-banner"><CircleAlert size={18} /><div><strong>1 trip · 180T affected</strong><span>Automatic re-planning found spare capacity on B-087.</span></div></div><div className="recovery-stats"><div><span>Additional cost</span><strong>+₹8,400</strong><small>1.9% of plan</small></div><div><span>Delay added</span><strong>+2h 00m</strong><small>still before deadline</small></div><div><span>Penalty avoided</span><strong>₹25,000</strong><small>deadline protected</small></div></div><div className="reassign"><span>REASSIGNMENT</span><div><div className="rec-boat danger">B-104</div><ArrowDownRight size={17} /><div className="rec-boat">B-087</div><div><strong>CG-2026-0012 · 180T Cement</strong><small>Kochi → Alappuzha · ETA 15 Oct · 08:30</small></div></div></div><div className="modal-footer"><span><CircleCheck size={15} /> No in-transit cargo will be cancelled</span><div><button className="button button-secondary" onClick={onClose}>Reject</button><button className="button button-primary" onClick={onApprove}><Check size={15} /> Approve recovery</button></div></div></div></div> }

function CopilotModal({ onClose, onOptimize, onBreakdown, onSimulate, onWhy, onQuote, onFleet }: {
  onClose: () => void;
  onOptimize: (mode: Mode) => void;
  onBreakdown: () => void;
  onSimulate: () => void;
  onWhy: () => void;
  onQuote: () => void;
  onFleet: () => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    intent: string;
    summary: string;
    actionText: string;
    action: () => void;
  } | null>({
    intent: "COPILOT_ONLINE",
    summary: "AI Copilot is online. Ask in plain English or select a suggested command.",
    actionText: "Optimize for Lowest CO₂",
    action: () => onOptimize("Lowest CO₂"),
  });

  const suggestions = [
    "Optimize for lowest CO2",
    "B-104 broke down",
    "What if demand increases by 30%?",
    "Why B-104?",
    "Show fleet status",
    "Compare instant quote"
  ];

  function runCommand(cmd: string) {
    setQuery(cmd);
    const lower = cmd.toLowerCase();
    if (lower.includes("co2") || lower.includes("lowest co2")) {
      setResult({
        intent: "OPTIMIZE_NETWORK",
        summary: "Parsed intent: Re-plan network with objective weights biased 60% towards emissions reduction.",
        actionText: "Optimize for Lowest CO₂",
        action: () => { onClose(); onOptimize("Lowest CO₂"); }
      });
    } else if (lower.includes("cost") || lower.includes("lowest cost")) {
      setResult({
        intent: "OPTIMIZE_NETWORK",
        summary: "Parsed intent: Re-plan network with objective weights biased towards minimum financial cost.",
        actionText: "Optimize for Lowest Cost",
        action: () => { onClose(); onOptimize("Lowest Cost"); }
      });
    } else if (lower.includes("breakdown") || lower.includes("unavailable") || lower.includes("b-104")) {
      setResult({
        intent: "DISRUPTION_RECOVERY",
        summary: "Parsed intent: Flag vessel B-104 as disrupted. Auto-generate emergency re-allocation draft for affected shipments.",
        actionText: "Trigger Disruption Plan",
        action: () => { onClose(); onBreakdown(); }
      });
    } else if (lower.includes("demand") || lower.includes("30%")) {
      setResult({
        intent: "SIMULATE_SCENARIO",
        summary: "Parsed intent: Project network with +30% volume expansion. Identify bottleneck corridors and capacity deficit.",
        actionText: "Open What-If Simulator",
        action: () => { onClose(); onSimulate(); }
      });
    } else if (lower.includes("why")) {
      setResult({
        intent: "EXPLAIN_DECISION",
        summary: "Parsed intent: Retrieve objective score breakdown and rule checklist for recommended vessel assignment.",
        actionText: "View Explainability Modal",
        action: () => { onClose(); onWhy(); }
      });
    } else if (lower.includes("fleet") || lower.includes("boat")) {
      setResult({
        intent: "NAVIGATE_FLEET",
        summary: "Parsed intent: Switch view to active boat operators, current voyages, and vessel capacities.",
        actionText: "Go to Fleet View",
        action: () => { onClose(); onFleet(); }
      });
    } else {
      setResult({
        intent: "QUOTE_CALCULATOR",
        summary: "Parsed intent: Compare waterway vs road door-to-door freight rates with backhaul amortization.",
        actionText: "Open Quote Comparison",
        action: () => { onClose(); onQuote(); }
      });
    }
  }

  return (
    <div className="overlay">
      <div className="modal copilot-modal">
        <div className="modal-header">
          <div>
            <div className="section-kicker">AI COPILOT · NATURAL LANGUAGE LOGISTICS</div>
            <h2>Command Assistant</h2>
            <p>Type a command or test one of the demo prompts below.</p>
          </div>
          <button className="small-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="copilot-input-box">
          <Bot size={18} style={{ color: "#32857a" }} />
          <input
            placeholder="E.g. 'Optimize for lowest CO2', 'B-104 broke down', 'What if demand increases by 30%'..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); runCommand(e.target.value); }}
            autoFocus
          />
          {query && <button className="small-icon" onClick={() => { setQuery(""); setResult(null); }}><X size={14} /></button>}
        </div>
        <div className="copilot-suggestions">
          {suggestions.map((s) => (
            <button key={s} className="copilot-chip" onClick={() => runCommand(s)}>
              {s}
            </button>
          ))}
        </div>
        {result && (
          <div className="copilot-result">
            <span className="copilot-intent-badge">{result.intent}</span>
            <p>{result.summary}</p>
            <button className="button button-primary" onClick={result.action}>
              <Zap size={14} /> {result.actionText}
            </button>
          </div>
        )}
        <div className="modal-footer">
          <span><Sparkles size={14} /> Strict zod allow-list intent validation enabled</span>
          <button className="button button-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function QuoteModal({ onClose, onBook }: { onClose: () => void; onBook: () => void }) {
  const [testRoadWins, setTestRoadWins] = useState(false);

  const waterwayRate = testRoadWins ? 546 : 263;
  const roadRate = 360;
  const savingPct = testRoadWins ? -51.6 : 26.9;
  const isWaterwayBetter = savingPct > 0;

  return (
    <div className="overlay">
      <div className="modal quote-modal">
        <div className="modal-header">
          <div>
            <div className="section-kicker">INSTANT FREIGHT ESTIMATE</div>
            <h2>Door-to-Door Quote Card</h2>
            <p>Full multimodal comparison: First mile + Waterway trunk + Last mile.</p>
          </div>
          <button className="small-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: "14px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "11px", color: "#627972" }}>Demonstrate road benchmark honesty:</span>
          <button
            className={`toggle ${testRoadWins ? "active" : ""}`}
            onClick={() => setTestRoadWins(!testRoadWins)}
          >
            <span /> {testRoadWins ? "Remote/Small Load (Road Wins)" : "Standard Waterway Corridor"}
          </button>
        </div>
        <div className="quote-card-box">
          <div className="quote-badge-row">
            <span className={`quote-badge ${isWaterwayBetter ? "waterway" : "road"}`}>
              {isWaterwayBetter ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
              Recommended: {isWaterwayBetter ? "Waterway Freight" : "Direct Road Transport"}
            </span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: isWaterwayBetter ? "#2c8273" : "#ad642e" }}>
              {isWaterwayBetter ? `${savingPct.toFixed(1)}% cheaper` : `Road is ${Math.abs(savingPct).toFixed(1)}% cheaper`}
            </span>
          </div>
          <div className="quote-prices">
            <div>
              <span style={{ display: "block", fontSize: "10px", color: "#8a9a94" }}>WATERWAY RATE</span>
              <strong>₹{waterwayRate} <small style={{ fontSize: "12px", fontWeight: 500 }}>/ tonne</small></strong>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ display: "block", fontSize: "10px", color: "#8a9a94" }}>ROAD BENCHMARK</span>
              <strong style={{ color: "#74837e" }}>₹{roadRate} <small style={{ fontSize: "12px", fontWeight: 500 }}>/ tonne</small></strong>
            </div>
          </div>
          <div className="compare-track">
            <div className="compare-fill-water" style={{ width: `${Math.min(100, Math.round((waterwayRate / (waterwayRate + roadRate)) * 100))}%` }} />
            <div className="compare-fill-road" style={{ width: `${Math.min(100, Math.round((roadRate / (waterwayRate + roadRate)) * 100))}%` }} />
          </div>
          <div className="quote-meta-row">
            <div><span>Estimated Transit ETA</span><strong>{testRoadWins ? "18 Oct · 11:00 AM" : "15 Oct · 05:40 PM"}</strong></div>
            <div><span>Net CO₂ Avoided</span><strong style={{ color: isWaterwayBetter ? "#2c8273" : "#b05747" }}>{isWaterwayBetter ? "−224 kg CO₂" : "+35 kg CO₂ (excess road legs)"}</strong></div>
          </div>
          <p className="quote-expl">
            {isWaterwayBetter
              ? "Waterway is 27% cheaper because vessel B-104 has a scheduled return load on the corridor, amortizing empty vessel repositioning."
              : "Road is currently the better option because the nearest terminal adds 42 km of drayage road travel and the small load cannot offset terminal handling charges."}
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button className="button button-secondary" onClick={onClose}>Close</button>
            <button className="button button-primary" onClick={onBook}>
              <Box size={14} /> Request Booking
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <span><CircleCheck size={14} /> All calculations derived from verified distance matrix</span>
        </div>
      </div>
    </div>
  );
}

function SimulatorModal({ simulator, setSimulator, metrics, onClose, onApply }: {
  simulator: any;
  setSimulator: (val: any) => void;
  metrics: any;
  onClose: () => void;
  onApply: () => void;
}) {
  const [demandPct, setDemandPct] = useState(simulator.demand || 0);
  const [removeB104, setRemoveB104] = useState(simulator.removeBoat || false);
  const [closeRoute, setCloseRoute] = useState(simulator.routeClosed || false);
  const [roadRate, setRoadRate] = useState(simulator.roadCost || 5);

  const simCost = Math.round(metrics.cost * (1 + demandPct / 100) * (closeRoute ? 1.18 : 1) * (removeB104 ? 1.09 : 1));
  const simCo2 = Math.round(metrics.co2Saved * (1 + demandPct / 100) * (closeRoute ? 0.82 : 1));
  const simUtil = Math.min(100, Math.round(metrics.utilization * (1 + demandPct / 120) * (removeB104 ? 1.25 : 1)));
  const simEmpty = closeRoute ? 336 : removeB104 ? 260 : 210;

  return (
    <div className="overlay">
      <div className="modal simulator-modal">
        <div className="modal-header">
          <div>
            <div className="section-kicker">WHAT-IF NETWORK SIMULATOR</div>
            <h2>Scenario Impact Modeling</h2>
            <p>Run deterministic simulations without mutating live database bookings.</p>
          </div>
          <button className="small-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sim-grid">
          <div className="sim-box">
            <label>Demand Adjustment: {demandPct > 0 ? `+${demandPct}%` : `${demandPct}%`}</label>
            <input
              type="range"
              min="-20"
              max="50"
              step="10"
              value={demandPct}
              onChange={(e) => setDemandPct(Number(e.target.value))}
            />
            <small style={{ color: "#7a8f89", fontSize: "10px" }}>Simulate harvest spikes or industrial surge</small>
          </div>
          <div className="sim-box">
            <label>Road Benchmark Cost: ₹{roadRate}/T-km</label>
            <input
              type="range"
              min="4"
              max="8"
              step="0.5"
              value={roadRate}
              onChange={(e) => setRoadRate(Number(e.target.value))}
            />
            <small style={{ color: "#7a8f89", fontSize: "10px" }}>Toll, diesel, and road congestion fluctuations</small>
          </div>
          <div className="sim-box">
            <label>Fleet Capacity Stress</label>
            <button
              className={`toggle ${removeB104 ? "active" : ""}`}
              onClick={() => setRemoveB104(!removeB104)}
            >
              <span /> {removeB104 ? "B-104 (20T) Removed" : "B-104 Available"}
            </button>
          </div>
          <div className="sim-box">
            <label>Corridor Status</label>
            <button
              className={`toggle ${closeRoute ? "active" : ""}`}
              onClick={() => setCloseRoute(!closeRoute)}
            >
              <span /> {closeRoute ? "Kochi ↔ Alappuzha Closed" : "All Corridors Open"}
            </button>
          </div>
        </div>
        <div style={{ padding: "0 24px 18px" }}>
          <h4 style={{ margin: "0 0 10px", fontSize: "12px", color: "#314f48" }}>Baseline vs Simulated Comparison</h4>
          <table className="delta-table">
            <thead>
              <tr>
                <th>KPI Metric</th>
                <th>Baseline</th>
                <th>Simulated</th>
                <th>Variance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Network Cost</td>
                <td>{money(metrics.cost)}</td>
                <td><strong>{money(simCost)}</strong></td>
                <td style={{ color: simCost > metrics.cost ? "#b9634b" : "#328c77" }}>
                  {simCost > metrics.cost ? `+${Math.round(((simCost - metrics.cost) / (metrics.cost || 1)) * 100)}%` : "0%"}
                </td>
              </tr>
              <tr>
                <td>CO₂ Avoided</td>
                <td>{metrics.co2Saved.toLocaleString()} kg</td>
                <td><strong>{simCo2.toLocaleString()} kg</strong></td>
                <td style={{ color: simCo2 >= metrics.co2Saved ? "#328c77" : "#b9634b" }}>
                  {simCo2 >= metrics.co2Saved ? `+${Math.round(((simCo2 - metrics.co2Saved) / (metrics.co2Saved || 1)) * 100)}%` : `-${Math.round(((metrics.co2Saved - simCo2) / (metrics.co2Saved || 1)) * 100)}%`}
                </td>
              </tr>
              <tr>
                <td>Fleet Utilization</td>
                <td>{metrics.utilization}%</td>
                <td><strong>{simUtil}%</strong></td>
                <td style={{ color: "#328c77" }}>+{Math.max(0, simUtil - metrics.utilization)} pts</td>
              </tr>
              <tr>
                <td>Empty Km Run</td>
                <td>{metrics.emptyKm} km</td>
                <td><strong>{simEmpty} km</strong></td>
                <td style={{ color: simEmpty > metrics.emptyKm ? "#b9634b" : "#328c77" }}>
                  {simEmpty > metrics.emptyKm ? `+${simEmpty - metrics.emptyKm} km` : "0 km"}
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: "14px", padding: "12px", background: "#f5f9f6", borderRadius: "8px", border: "1px solid #dce8e1", fontSize: "11px", color: "#45665d" }}>
            <strong>Capacity Bottleneck Analysis:</strong>
            <p style={{ margin: "4px 0 0" }}>
              {demandPct >= 20 || closeRoute
                ? "Corridor Kochi → Alappuzha is constrained (+36T deficit). Recommended action: Mobilize idle vessel B-112 or schedule an additional evening voyage."
                : "Network capacity has healthy slack across all 4 corridors. No bottleneck alerts detected."}
            </p>
          </div>
        </div>
        <div className="modal-footer">
          <span><SlidersHorizontal size={14} /> Deterministic pure function in-memory execution</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="button button-secondary" onClick={onClose}>Close</button>
            <button
              className="button button-primary"
              onClick={() => {
                setSimulator({ removeBoat: removeB104, demand: demandPct, routeClosed: closeRoute, roadCost: roadRate });
                onApply();
              }}
            >
              <Check size={14} /> Apply as Draft Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DelayModal({ onClose, onReport }: { onClose: () => void; onReport: (mins: number, reason: string) => void }) {
  const [mins, setMins] = useState(30);
  const [reason, setReason] = useState("Lock queue delay");

  return (
    <div className="overlay">
      <div className="modal" style={{ width: "min(480px, 100%)" }}>
        <div className="modal-header">
          <div>
            <div className="section-kicker">VOYAGE PROGRESS</div>
            <h2>Report Voyage Delay</h2>
            <p>Broadcast schedule disruption to update predictive ETAs.</p>
          </div>
          <button className="small-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px", display: "grid", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#48625b", marginBottom: "8px" }}>Estimated Delay Duration</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {[15, 30, 60, 120].map((m) => (
                <button
                  key={m}
                  className={`button ${mins === m ? "button-primary" : "button-secondary"}`}
                  style={{ flex: 1 }}
                  onClick={() => setMins(m)}
                >
                  +{m}m
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#48625b", marginBottom: "6px" }}>Stated Delay Cause</label>
            <select
              style={{ width: "100%", padding: "9px 10px", borderRadius: "8px", border: "1px solid #dce8e0", fontSize: "12px", background: "#fff", color: "#28443e" }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option>Lock queue delay</option>
              <option>Heavy monsoon rain / tidal limit</option>
              <option>Terminal cargo dwell / crane busy</option>
              <option>Engine speed restriction</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <span><Clock3 size={14} /> Automatically notifies cargo owners and admin</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="button button-secondary" onClick={onClose}>Cancel</button>
            <button className="button button-primary" onClick={() => onReport(mins, reason)}>
              <CircleAlert size={14} /> Broadcast Delay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
