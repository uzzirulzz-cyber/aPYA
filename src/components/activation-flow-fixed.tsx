"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useActivate, useSignIn, useSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
    FlaskConical,
    ShieldCheck,
    Fingerprint,
    ScanLine,
    Database,
    FileDown,
    Lock,
    ArrowRight,
    Terminal,
    LogIn,
    Eye,
    EyeOff,
} from "lucide-react";

const FEATURES = [
    { icon: Fingerprint, title: "Device Acquisition", desc: "5 acquisition methods · SHA-256/512 integrity hashing" },
    { icon: ScanLine, title: "4-Stage Scanning", desc: "Analysis → Discovery → Parsing → Carving pipeline" },
    { icon: Database, title: "Evidence Intelligence", desc: "18 data categories · confidence scoring · tagging" },
    { icon: FileDown, title: "Chain-of-Custody Delivery", desc: "UFED XML · CSV · JSON · PDF report exports" },
];

export function ActivationFlow() {
    const searchParams = useSearchParams();
    const paramMode = searchParams.get("mode");
    const initialActivationMode: "create" | "join" = paramMode === "create" ? "create" : "join";
    const initialLicenseKey = searchParams.get("licenseKey") ?? "";
    const initialInviteToken = searchParams.get("invite") ?? "";
    const initialTab: "signin" | "activate" = paramMode === "join" || paramMode === "create" || !!initialInviteToken ? "activate" : "signin";

    const [tab, setTab] = useState<"signin" | "activate">(initialTab);
    const [activationMode, setActivationMode] = useState<"create" | "join">(initialActivationMode);
    const [licenseKey, setLicenseKey] = useState(initialLicenseKey);
    const [inviteToken, setInviteToken] = useState(initialInviteToken);
    const [resolvedOrgName, setResolvedOrgName] = useState<string | null>(null);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [licenseType, setLicenseType] = useState<"standard" | "professional" | "enterprise">("professional");
    const [orgName, setOrgName] = useState("");
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const router = useRouter();
    const { data: session, isLoading: sessionLoading } = useSession();
    const signIn = useSignIn();
    const activate = useActivate();
    const loading = signIn.isPending || activate.isPending;

    useEffect(() => {
        if (initialInviteToken) {
            setTab("activate");
            setActivationMode("join");
            setInviteToken(initialInviteToken);
            setInviteError(null);
            let cancelled = false;

            const resolveInvite = async () => {
                try {
                    const res = await fetch(`/api/invite?token=${encodeURIComponent(initialInviteToken)}`);
                    const data = await res.json();
                    if (!res.ok || !data?.organization) {
                        throw new Error(data?.error || "Staff access link could not be loaded");
                    }
                    if (!cancelled) {
                        setLicenseKey(data.organization.licenseKey);
                        setResolvedOrgName(data.organization.name);
                    }
                } catch (e) {
                    if (!cancelled) {
                        setInviteError(e instanceof Error ? e.message : "Staff access link could not be loaded");
                    }
                }
            };

            resolveInvite();
            return () => {
                cancelled = true;
            };
        }

        if (initialLicenseKey) {
            setTab("activate");
            setLicenseKey(initialLicenseKey);
            setActivationMode(initialActivationMode);
        }
    }, [initialInviteToken, initialLicenseKey, initialActivationMode]);

    useEffect(() => {
        if (!sessionLoading && session?.user) {
            router.push("/admin");
        }
    }, [session, sessionLoading, router]);

    const handleSignIn = async () => {
        if (!email || !password) {
            toast.error("Email and password are required");
            return;
        }

        try {
            await signIn.mutateAsync({ email: email.trim(), password });
            toast.success("Signed in");
            router.push("/admin");
        } catch (e) {
            toast.error((e as Error).message);
        }
    };

    const handleActivate = async () => {
        if (!licenseKey || !email || !name || !password) {
            toast.error("Please complete all required fields");
            return;
        }
        if (password.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }
        if (activationMode === "create" && !orgName.trim()) {
            toast.error("Organization name is required to create a new license activation");
            return;
        }

        try {
            await activate.mutateAsync({
                mode: activationMode,
                orgName: activationMode === "create" ? orgName.trim() : undefined,
                licenseKey: licenseKey.trim().toUpperCase(),
                licenseType: activationMode === "create" ? licenseType : undefined,
                email: email.trim(),
                name: name.trim(),
                password,
            });
            toast.success("Activation complete — you are signed in.");
            router.push("/admin");
        } catch (e) {
            toast.error((e as Error).message);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-background bg-grid-pattern">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top_left,_rgba(100,255,183,0.16),_transparent_60%)]" />
            <header className="relative h-14 border-b border-border/60 bg-card/85 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
                <div className="flex h-full items-center gap-2.5 px-5">
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 via-primary/10 to-accent/25 ring-1 ring-primary/30 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]">
                        <img src="/logo.png" alt="Organization logo" className="h-5 w-5" />
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent pulse-ring" />
                    </div>
                    <div className="leading-none">
                        <div className="text-sm font-semibold tracking-tight">Portal</div>
                        <div className="text-[10px] text-muted-foreground font-mono-forensic">GEO INTELLIGENCE · STAFF ACCESS</div>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px] font-mono-forensic">
                        <Lock className="mr-1 h-3 w-3" /> SECURE SESSION
                    </Badge>
                </div>
            </header>

            <div className="flex-1 grid lg:grid-cols-2 gap-0">
                <div className="hidden lg:flex flex-col justify-center p-12 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
                    <div className="relative max-w-lg space-y-8">
                        <div className="space-y-3">
                            <Badge variant="outline" className="text-[10px] font-mono-forensic">
                                <Terminal className="mr-1 h-3 w-3" /> FORENSIC INTELLIGENCE PLATFORM
                            </Badge>
                            <h1 className="text-4xl font-bold tracking-tight leading-tight">
                                Track every movement.
                                <br />
                                <span className="text-primary">Protect every trail.</span>
                            </h1>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                This platform brings together wildlife monitoring, location intelligence, and secure field access in a single polished workspace designed for rapid response and accurate evidence review.
                            </p>
                        </div>

                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 }}
                            className="relative overflow-hidden rounded-2xl border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(100,255,183,0.16),_transparent_45%),linear-gradient(135deg,rgba(13,17,30,0.95),rgba(20,29,42,0.95))] p-4 shadow-[0_20px_45px_rgba(0,0,0,0.22)]"
                        >
                            <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.06)_45%,transparent_100%)]" />
                            <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_20%,rgba(100,255,183,0.25),transparent_20%),radial-gradient(circle_at_80%_40%,rgba(255,190,73,0.2),transparent_25%)]" />
                            <div className="relative space-y-3">
                                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                                    <span>Live route map</span>
                                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] text-primary">ACTIVE</span>
                                </div>
                                <div className="relative h-28 overflow-hidden rounded-xl border border-border/50 bg-background/30">
                                    <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(100,255,183,0.08),transparent_50%,rgba(255,190,73,0.08))]" />
                                    <svg viewBox="0 0 320 120" className="absolute inset-0 h-full w-full">
                                        <path d="M20 88 C70 70, 105 60, 132 72 S195 100, 224 77 S280 35, 300 28" stroke="rgba(100,255,183,0.8)" strokeWidth="3" fill="none" strokeLinecap="round" />
                                        <path d="M44 44 C80 58, 122 40, 148 52 S208 70, 240 54 S286 34, 300 28" stroke="rgba(255,190,73,0.8)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="4 4" />
                                        <circle cx="132" cy="72" r="5" fill="#64ffb7" />
                                        <circle cx="224" cy="77" r="5" fill="#ffbe49" />
                                        <circle cx="300" cy="28" r="5" fill="#7dd3fc" />
                                    </svg>
                                    <motion.div
                                        animate={{ x: [0, 40, 0], y: [0, -8, 0] }}
                                        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
                                        className="absolute left-12 top-10 h-3 w-3 rounded-full bg-accent shadow-[0_0_24px_rgba(255,190,73,0.7)]"
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { label: "Trail points", value: "18" },
                                        { label: "Signal", value: "97%" },
                                        { label: "Last ping", value: "2m" },
                                    ].map((stat) => (
                                        <div key={stat.label} className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2">
                                            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{stat.label}</div>
                                            <div className="mt-1 text-sm font-semibold text-foreground">{stat.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>

                        <div className="grid grid-cols-2 gap-3">
                            {FEATURES.map((feature, index) => (
                                <motion.div
                                    key={feature.title}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 + index * 0.08 }}
                                    className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
                                >
                                    <feature.icon className="h-5 w-5 text-primary mb-2" />
                                    <div className="text-sm font-medium">{feature.title}</div>
                                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                        {feature.desc}
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="rounded-xl border border-border/60 bg-card/70 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.15)]">
                            <div className="flex items-center gap-2 mb-2">
                                <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                                <span className="text-xs font-medium">Authentication & Access</span>
                            </div>
                            <div className="space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                                <div>• Real password-based authentication (bcrypt-hashed)</div>
                                <div>• The first registered account becomes the single platform admin</div>
                                <div>• Join your organization through a secure staff access link</div>
                                <div>• Sessions remain active while you use the app</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-center p-6 sm:p-12">
                    <div className="w-full max-w-md">
                        <Tabs value={tab} onValueChange={(value) => setTab(value as "signin" | "activate")}>
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="signin" className="text-xs">
                                    <LogIn className="mr-1.5 h-3 w-3" /> Sign In
                                </TabsTrigger>
                                <TabsTrigger value="activate" className="text-xs">
                                    <ShieldCheck className="mr-1.5 h-3 w-3" /> Activate
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="signin">
                                <Card className="border-border/60 shadow-[0_20px_50px_rgba(0,0,0,0.16)]">
                                    <CardHeader>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Fingerprint className="h-4 w-4 text-primary" />
                                            Sign in to STAFF PORTAL
                                        </CardTitle>
                                        <CardDescription>
                                            Enter your registered email and password to resume your session.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="signin-email" className="text-xs">Email</Label>
                                            <Input
                                                id="signin-email"
                                                type="email"
                                                placeholder="investigator@agency.gov"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="signin-password" className="text-xs">Password</Label>
                                            <div className="relative">
                                                <Input
                                                    id="signin-password"
                                                    type={showPassword ? "text" : "password"}
                                                    placeholder="••••••••"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                                                    className="pr-9"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword((value) => !value)}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                                                    tabIndex={-1}
                                                >
                                                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                        <Button className="w-full cursor-pointer" onClick={handleSignIn} disabled={loading}>
                                            {loading ? "Signing in…" : "Sign In"}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                        <div className="text-[11px] text-center text-muted-foreground">
                                            Need to activate first? Switch to the <strong>Activate</strong> tab.
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="activate">
                                <Card className="border-border/60 shadow-[0_20px_50px_rgba(0,0,0,0.16)]">
                                    <CardHeader>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-primary" />
                                            Activate your access
                                        </CardTitle>
                                        <CardDescription>
                                            Use your invite link to join an existing organization or create a new one in a few quick steps.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="activate-name" className="text-xs">Full name</Label>
                                                <Input
                                                    id="activate-name"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    placeholder="Dana Scully"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="activate-email" className="text-xs">Email</Label>
                                                <Input
                                                    id="activate-email"
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    placeholder="investigator@agency.gov"
                                                />
                                            </div>
                                        </div>
                                        {inviteToken ? (
                                            <div className="rounded-md border border-border/60 bg-card/70 p-3 text-sm text-muted-foreground shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                                                {inviteError ? (
                                                    <div className="text-destructive">{inviteError}</div>
                                                ) : resolvedOrgName ? (
                                                    <>
                                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Staff access ready</div>
                                                        <div className="mt-1 font-medium text-foreground">{resolvedOrgName}</div>
                                                        <div className="mt-1 text-xs">Your invitation is ready. Finish the form below to activate your account.</div>
                                                    </>
                                                ) : (
                                                    <div>Preparing your staff access link…</div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                <Label htmlFor="activate-license" className="text-xs">License key</Label>
                                                <Input
                                                    id="activate-license"
                                                    value={licenseKey}
                                                    onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                                                    placeholder="FORENSIQ-2026-ABC123-XYZ789"
                                                />
                                            </div>
                                        )}
                                        <div className="flex flex-col gap-2 sm:flex-row">
                                            <Button
                                                variant={activationMode === "create" ? "secondary" : "outline"}
                                                className="w-full sm:w-auto"
                                                onClick={() => setActivationMode("create")}
                                            >
                                                Create new org
                                            </Button>
                                            <Button
                                                variant={activationMode === "join" ? "secondary" : "outline"}
                                                className="w-full sm:w-auto"
                                                onClick={() => setActivationMode("join")}
                                            >
                                                Join existing org
                                            </Button>
                                        </div>
                                        {activationMode === "create" && (
                                            <div className="space-y-1.5">
                                                <Label htmlFor="activate-org" className="text-xs">Organization name</Label>
                                                <Input
                                                    id="activate-org"
                                                    value={orgName}
                                                    onChange={(e) => setOrgName(e.target.value)}
                                                    placeholder="Quantico Digital Forensics"
                                                />
                                            </div>
                                        )}
                                        {activationMode === "create" && (
                                            <div className="space-y-1.5">
                                                <Label htmlFor="activate-type" className="text-xs">License tier</Label>
                                                <Select
                                                    value={licenseType}
                                                    onValueChange={(value) => setLicenseType(value as "standard" | "professional" | "enterprise")}
                                                >
                                                    <SelectTrigger id="activate-type" className="w-full">
                                                        <SelectValue placeholder="Select license tier" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="standard">Standard</SelectItem>
                                                        <SelectItem value="professional">Professional</SelectItem>
                                                        <SelectItem value="enterprise">Enterprise</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                        <div className="space-y-1.5">
                                            <Label htmlFor="activate-password" className="text-xs">Password (min 8 characters)</Label>
                                            <div className="relative">
                                                <Input
                                                    id="activate-password"
                                                    type={showPassword ? "text" : "password"}
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    className="pr-9"
                                                    onKeyDown={(e) => e.key === "Enter" && handleActivate()}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword((prev) => !prev)}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                                                    tabIndex={-1}
                                                >
                                                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                        <Button className="w-full cursor-pointer" onClick={handleActivate} disabled={loading}>
                                            {loading ? "Activating…" : activationMode === "create" ? "Create organization" : "Join organization"}
                                        </Button>
                                        <div className="text-[11px] text-muted-foreground">
                                            Staff access links are short and private. They open the activation form directly and connect you to your organization.
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
            <footer className="border-t border-border/60 bg-card/50 px-4 py-2.5 mt-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-forensic text-muted-foreground">
                    <span>FORENSIQ v4.2.1</span>
                    <span>SECURE CHAIN-OF-CUSTODY · TAMPER-EVIDENT AUDIT LOG · BCRYPT AUTH</span>
                </div>
            </footer>
        </div>
    );
}
