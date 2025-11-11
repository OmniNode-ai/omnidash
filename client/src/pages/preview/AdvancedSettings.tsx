import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Settings, 
  Save, 
  RefreshCw, 
  Download, 
  Upload,
  Bell,
  Shield,
  Zap,
  Database,
  Globe,
  Palette,
  Keyboard,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Brain,
  Lightbulb,
  Layers,
  Cpu,
  HardDrive,
  Wifi,
  BarChart3,
  PieChart,
  LineChart,
  Target,
  Users,
  Lock,
  Unlock,
  Play,
  Pause,
  RotateCcw
} from "lucide-react";

export default function AdvancedSettings() {
  const [settings, setSettings] = useState({
    // General Settings
    theme: "dark",
    language: "en",
    timezone: "UTC",
    autoRefresh: true,
    refreshInterval: 30,
    
    // Notifications
    emailNotifications: true,
    pushNotifications: false,
    alertThresholds: {
      errorRate: 5,
      responseTime: 1000,
      cpuUsage: 80,
      memoryUsage: 85
    },
    
    // Performance
    cacheEnabled: true,
    cacheTTL: 300,
    maxConnections: 100,
    requestTimeout: 30000,
    
    // Security
    twoFactorAuth: false,
    sessionTimeout: 3600,
    ipWhitelist: "",
    auditLogging: true,
    
    // Display
    itemsPerPage: 50,
    showTooltips: true,
    compactMode: false,
    animations: true,
    
    // Data Sources
    primaryDatabase: "postgresql",
    backupDatabase: "mysql",
    enableReplication: true,
    dataRetention: 90,
    
    // AI & ML Settings
    aiModelProvider: "claude",
    aiModelVersion: "3.5-sonnet",
    aiCostLimit: 1000,
    aiResponseTimeout: 30000,
    enablePredictiveAnalytics: true,
    mlModelRefreshInterval: 3600,
    
    // Optimization Settings
    enableAutoScaling: true,
    scalingThreshold: 75,
    enableCostOptimization: true,
    resourceOptimizationLevel: "balanced",
    enableCaching: true,
    cacheStrategy: "lru",
    
    // Monitoring & Alerting
    enableAdvancedMonitoring: true,
    monitoringInterval: 60,
    alertChannels: ["email", "slack"],
    enableAnomalyDetection: true,
    anomalySensitivity: "medium",
    
    // Integration Settings
    enableWebhooks: true,
    webhookTimeout: 5000,
    enableApiRateLimiting: true,
    rateLimitRequests: 1000,
    enableCors: true,
    corsOrigins: "*"
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const handleSettingChange = (category: string, key: string, value: any) => {
    setSettings(prev => {
      const categoryValue = prev[category as keyof typeof prev];
      if (typeof categoryValue === 'object' && categoryValue !== null) {
        return {
          ...prev,
          [category]: {
            ...(categoryValue as Record<string, any>),
            [key]: value
          }
        };
      }
      return prev;
    });
    setHasUnsavedChanges(true);
  };

  const handleDirectSettingChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    console.log("Saving settings:", settings);
    setHasUnsavedChanges(false);
  };

  const handleReset = () => {
    setSettings({
      theme: "dark",
      language: "en",
      timezone: "UTC",
      autoRefresh: true,
      refreshInterval: 30,
      emailNotifications: true,
      pushNotifications: false,
      alertThresholds: {
        errorRate: 5,
        responseTime: 1000,
        cpuUsage: 80,
        memoryUsage: 85
      },
      cacheEnabled: true,
      cacheTTL: 300,
      maxConnections: 100,
      requestTimeout: 30000,
      twoFactorAuth: false,
      sessionTimeout: 3600,
      ipWhitelist: "",
      auditLogging: true,
      itemsPerPage: 50,
      showTooltips: true,
      compactMode: false,
      animations: true,
      primaryDatabase: "postgresql",
      backupDatabase: "mysql",
      enableReplication: true,
      dataRetention: 90,
      aiModelProvider: "claude",
      aiModelVersion: "3.5-sonnet",
      aiCostLimit: 1000,
      aiResponseTimeout: 30000,
      enablePredictiveAnalytics: true,
      mlModelRefreshInterval: 3600,
      enableAutoScaling: true,
      scalingThreshold: 75,
      enableCostOptimization: true,
      resourceOptimizationLevel: "balanced",
      enableCaching: true,
      cacheStrategy: "lru",
      enableAdvancedMonitoring: true,
      monitoringInterval: 60,
      alertChannels: ["email", "slack"],
      enableAnomalyDetection: true,
      anomalySensitivity: "medium",
      enableWebhooks: true,
      webhookTimeout: 5000,
      enableApiRateLimiting: true,
      rateLimitRequests: 1000,
      enableCors: true,
      corsOrigins: "*"
    });
    setHasUnsavedChanges(false);
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(settings, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'omnidash-settings.json';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedSettings = JSON.parse(e.target?.result as string);
          setSettings(importedSettings);
          setHasUnsavedChanges(true);
        } catch (error) {
          console.error('Error importing settings:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  const tabs = [
    { id: "general", label: "General", icon: Settings },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "performance", label: "Performance", icon: Zap },
    { id: "security", label: "Security", icon: Shield },
    { id: "display", label: "Display", icon: Palette },
    { id: "data", label: "Data Sources", icon: Database },
    { id: "ai", label: "AI & ML", icon: Brain },
    { id: "optimization", label: "Optimization", icon: Lightbulb },
    { id: "monitoring", label: "Monitoring", icon: Eye },
    { id: "integration", label: "Integration", icon: Globe },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Advanced Settings</h1>
          <p className="text-muted-foreground">
            Configure system behavior, notifications, and advanced features
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Badge variant="outline" className="text-yellow-600">
              Unsaved Changes
            </Badge>
          )}
          <Button variant="outline" onClick={handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" onClick={() => document.getElementById('import-settings')?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <input
            id="import-settings"
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <Button onClick={handleSave} disabled={!hasUnsavedChanges}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2"
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {activeTab === "general" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Basic application configuration and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={settings.theme} onValueChange={(value) => handleDirectSettingChange('theme', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={settings.language} onValueChange={(value) => handleDirectSettingChange('language', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={settings.timezone} onValueChange={(value) => handleDirectSettingChange('timezone', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refreshInterval">Auto-refresh Interval (seconds)</Label>
                  <div className="space-y-2">
                    <Slider
                      value={[settings.refreshInterval]}
                      onValueChange={(value) => handleDirectSettingChange('refreshInterval', value[0])}
                      max={300}
                      min={5}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>5s</span>
                      <span>{settings.refreshInterval}s</span>
                      <span>5m</span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-refresh</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically refresh data at the specified interval
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoRefresh}
                    onCheckedChange={(checked) => handleDirectSettingChange('autoRefresh', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "notifications" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure how and when you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive alerts and updates via email
                    </p>
                  </div>
                  <Switch
                    checked={settings.emailNotifications}
                    onCheckedChange={(checked) => handleDirectSettingChange('emailNotifications', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive browser push notifications
                    </p>
                  </div>
                  <Switch
                    checked={settings.pushNotifications}
                    onCheckedChange={(checked) => handleDirectSettingChange('pushNotifications', checked)}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-lg font-medium">Alert Thresholds</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Error Rate (%)</Label>
                    <Input
                      type="number"
                      value={settings.alertThresholds.errorRate}
                      onChange={(e) => handleSettingChange('alertThresholds', 'errorRate', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Response Time (ms)</Label>
                    <Input
                      type="number"
                      value={settings.alertThresholds.responseTime}
                      onChange={(e) => handleSettingChange('alertThresholds', 'responseTime', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CPU Usage (%)</Label>
                    <Input
                      type="number"
                      value={settings.alertThresholds.cpuUsage}
                      onChange={(e) => handleSettingChange('alertThresholds', 'cpuUsage', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Memory Usage (%)</Label>
                    <Input
                      type="number"
                      value={settings.alertThresholds.memoryUsage}
                      onChange={(e) => handleSettingChange('alertThresholds', 'memoryUsage', parseInt(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "performance" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Performance Settings
              </CardTitle>
              <CardDescription>
                Optimize system performance and resource usage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Caching</Label>
                    <p className="text-sm text-muted-foreground">
                      Cache frequently accessed data to improve performance
                    </p>
                  </div>
                  <Switch
                    checked={settings.cacheEnabled}
                    onCheckedChange={(checked) => handleDirectSettingChange('cacheEnabled', checked)}
                  />
                </div>

                {settings.cacheEnabled && (
                  <div className="space-y-2">
                    <Label>Cache TTL (seconds)</Label>
                    <Input
                      type="number"
                      value={settings.cacheTTL}
                      onChange={(e) => handleDirectSettingChange('cacheTTL', parseInt(e.target.value))}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Max Connections</Label>
                  <Input
                    type="number"
                    value={settings.maxConnections}
                    onChange={(e) => handleDirectSettingChange('maxConnections', parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Request Timeout (ms)</Label>
                  <Input
                    type="number"
                    value={settings.requestTimeout}
                    onChange={(e) => handleDirectSettingChange('requestTimeout', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "security" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Configure security features and access controls
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">
                      Add an extra layer of security to your account
                    </p>
                  </div>
                  <Switch
                    checked={settings.twoFactorAuth}
                    onCheckedChange={(checked) => handleDirectSettingChange('twoFactorAuth', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Session Timeout (seconds)</Label>
                  <Input
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) => handleDirectSettingChange('sessionTimeout', parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>IP Whitelist</Label>
                  <Input
                    placeholder="192.168.1.0/24, 10.0.0.0/8"
                    value={settings.ipWhitelist}
                    onChange={(e) => handleDirectSettingChange('ipWhitelist', e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Comma-separated list of allowed IP addresses or CIDR blocks
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Audit Logging</Label>
                    <p className="text-sm text-muted-foreground">
                      Log all user actions and system events
                    </p>
                  </div>
                  <Switch
                    checked={settings.auditLogging}
                    onCheckedChange={(checked) => handleDirectSettingChange('auditLogging', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "display" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Display Settings
              </CardTitle>
              <CardDescription>
                Customize the appearance and behavior of the interface
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Items Per Page</Label>
                  <Select value={settings.itemsPerPage.toString()} onValueChange={(value) => handleDirectSettingChange('itemsPerPage', parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show Tooltips</Label>
                    <p className="text-sm text-muted-foreground">
                      Display helpful tooltips on hover
                    </p>
                  </div>
                  <Switch
                    checked={settings.showTooltips}
                    onCheckedChange={(checked) => handleDirectSettingChange('showTooltips', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Compact Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Use a more compact layout to fit more content
                    </p>
                  </div>
                  <Switch
                    checked={settings.compactMode}
                    onCheckedChange={(checked) => handleDirectSettingChange('compactMode', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Animations</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable smooth transitions and animations
                    </p>
                  </div>
                  <Switch
                    checked={settings.animations}
                    onCheckedChange={(checked) => handleDirectSettingChange('animations', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "data" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Data Source Settings
              </CardTitle>
              <CardDescription>
                Configure database connections and data management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary Database</Label>
                  <Select value={settings.primaryDatabase} onValueChange={(value) => handleDirectSettingChange('primaryDatabase', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                      <SelectItem value="mysql">MySQL</SelectItem>
                      <SelectItem value="sqlite">SQLite</SelectItem>
                      <SelectItem value="mongodb">MongoDB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Backup Database</Label>
                  <Select value={settings.backupDatabase} onValueChange={(value) => handleDirectSettingChange('backupDatabase', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                      <SelectItem value="mysql">MySQL</SelectItem>
                      <SelectItem value="sqlite">SQLite</SelectItem>
                      <SelectItem value="mongodb">MongoDB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Data Retention (days)</Label>
                  <Input
                    type="number"
                    value={settings.dataRetention}
                    onChange={(e) => handleDirectSettingChange('dataRetention', parseInt(e.target.value))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Replication</Label>
                    <p className="text-sm text-muted-foreground">
                      Replicate data to backup database
                    </p>
                  </div>
                  <Switch
                    checked={settings.enableReplication}
                    onCheckedChange={(checked) => handleDirectSettingChange('enableReplication', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI & ML Settings */}
        {activeTab === "ai" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                AI & ML Settings
              </CardTitle>
              <CardDescription>
                Configure AI model preferences and machine learning features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>AI Model Provider</Label>
                  <Select value={settings.aiModelProvider} onValueChange={(value) => handleDirectSettingChange('aiModelProvider', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude">Claude (Anthropic)</SelectItem>
                      <SelectItem value="gpt">GPT (OpenAI)</SelectItem>
                      <SelectItem value="mixtral">Mixtral</SelectItem>
                      <SelectItem value="deepseek">DeepSeek</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Model Version</Label>
                  <Select value={settings.aiModelVersion} onValueChange={(value) => handleDirectSettingChange('aiModelVersion', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                      <SelectItem value="3.5-haiku">Claude 3.5 Haiku</SelectItem>
                      <SelectItem value="4">GPT-4</SelectItem>
                      <SelectItem value="4-turbo">GPT-4 Turbo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>AI Cost Limit ($/month)</Label>
                  <Input
                    type="number"
                    value={settings.aiCostLimit}
                    onChange={(e) => handleDirectSettingChange('aiCostLimit', parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Response Timeout (ms)</Label>
                  <Input
                    type="number"
                    value={settings.aiResponseTimeout}
                    onChange={(e) => handleDirectSettingChange('aiResponseTimeout', parseInt(e.target.value))}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Predictive Analytics</Label>
                    <p className="text-sm text-muted-foreground">
                      Use ML models to predict system behavior and optimize performance
                    </p>
                  </div>
                  <Switch
                    checked={settings.enablePredictiveAnalytics}
                    onCheckedChange={(checked) => handleDirectSettingChange('enablePredictiveAnalytics', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>ML Model Refresh Interval (seconds)</Label>
                  <Input
                    type="number"
                    value={settings.mlModelRefreshInterval}
                    onChange={(e) => handleDirectSettingChange('mlModelRefreshInterval', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Optimization Settings */}
        {activeTab === "optimization" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                Optimization Settings
              </CardTitle>
              <CardDescription>
                Configure automatic optimization and resource management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Auto-scaling</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically scale resources based on demand
                    </p>
                  </div>
                  <Switch
                    checked={settings.enableAutoScaling}
                    onCheckedChange={(checked) => handleDirectSettingChange('enableAutoScaling', checked)}
                  />
                </div>

                {settings.enableAutoScaling && (
                  <div className="space-y-2">
                    <Label>Scaling Threshold (%)</Label>
                    <div className="space-y-2">
                      <Slider
                        value={[settings.scalingThreshold]}
                        onValueChange={(value) => handleDirectSettingChange('scalingThreshold', value[0])}
                        max={100}
                        min={50}
                        step={5}
                        className="w-full"
                      />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>50%</span>
                        <span>{settings.scalingThreshold}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Cost Optimization</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically optimize costs while maintaining performance
                    </p>
                  </div>
                  <Switch
                    checked={settings.enableCostOptimization}
                    onCheckedChange={(checked) => handleDirectSettingChange('enableCostOptimization', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Resource Optimization Level</Label>
                  <Select value={settings.resourceOptimizationLevel} onValueChange={(value) => handleDirectSettingChange('resourceOptimizationLevel', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="aggressive">Aggressive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Cache Strategy</Label>
                  <Select value={settings.cacheStrategy} onValueChange={(value) => handleDirectSettingChange('cacheStrategy', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lru">LRU (Least Recently Used)</SelectItem>
                      <SelectItem value="lfu">LFU (Least Frequently Used)</SelectItem>
                      <SelectItem value="fifo">FIFO (First In, First Out)</SelectItem>
                      <SelectItem value="ttl">TTL (Time To Live)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monitoring Settings */}
        {activeTab === "monitoring" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Monitoring & Alerting
              </CardTitle>
              <CardDescription>
                Configure advanced monitoring and alerting capabilities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Advanced Monitoring</Label>
                    <p className="text-sm text-muted-foreground">
                      Use advanced monitoring features for deeper insights
                    </p>
                  </div>
                  <Switch
                    checked={settings.enableAdvancedMonitoring}
                    onCheckedChange={(checked) => handleDirectSettingChange('enableAdvancedMonitoring', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Monitoring Interval (seconds)</Label>
                  <Input
                    type="number"
                    value={settings.monitoringInterval}
                    onChange={(e) => handleDirectSettingChange('monitoringInterval', parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Alert Channels</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="email-alerts"
                        checked={settings.alertChannels.includes('email')}
                        onChange={(e) => {
                          const channels = e.target.checked
                            ? [...settings.alertChannels, 'email']
                            : settings.alertChannels.filter(c => c !== 'email');
                          handleDirectSettingChange('alertChannels', channels);
                        }}
                      />
                      <Label htmlFor="email-alerts">Email</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="slack-alerts"
                        checked={settings.alertChannels.includes('slack')}
                        onChange={(e) => {
                          const channels = e.target.checked
                            ? [...settings.alertChannels, 'slack']
                            : settings.alertChannels.filter(c => c !== 'slack');
                          handleDirectSettingChange('alertChannels', channels);
                        }}
                      />
                      <Label htmlFor="slack-alerts">Slack</Label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Anomaly Detection</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically detect unusual patterns in system behavior
                    </p>
                  </div>
                  <Switch
                    checked={settings.enableAnomalyDetection}
                    onCheckedChange={(checked) => handleDirectSettingChange('enableAnomalyDetection', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Anomaly Sensitivity</Label>
                  <Select value={settings.anomalySensitivity} onValueChange={(value) => handleDirectSettingChange('anomalySensitivity', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Integration Settings */}
        {activeTab === "integration" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Integration Settings
              </CardTitle>
              <CardDescription>
                Configure external integrations and API settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Webhooks</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow external systems to receive real-time updates
                    </p>
                  </div>
                  <Switch
                    checked={settings.enableWebhooks}
                    onCheckedChange={(checked) => handleDirectSettingChange('enableWebhooks', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Webhook Timeout (ms)</Label>
                  <Input
                    type="number"
                    value={settings.webhookTimeout}
                    onChange={(e) => handleDirectSettingChange('webhookTimeout', parseInt(e.target.value))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable API Rate Limiting</Label>
                    <p className="text-sm text-muted-foreground">
                      Limit API requests to prevent abuse
                    </p>
                  </div>
                  <Switch
                    checked={settings.enableApiRateLimiting}
                    onCheckedChange={(checked) => handleDirectSettingChange('enableApiRateLimiting', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Rate Limit (requests/hour)</Label>
                  <Input
                    type="number"
                    value={settings.rateLimitRequests}
                    onChange={(e) => handleDirectSettingChange('rateLimitRequests', parseInt(e.target.value))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable CORS</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow cross-origin requests from web browsers
                    </p>
                  </div>
                  <Switch
                    checked={settings.enableCors}
                    onCheckedChange={(checked) => handleDirectSettingChange('enableCors', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>CORS Origins</Label>
                  <Input
                    placeholder="https://example.com, https://app.example.com"
                    value={settings.corsOrigins}
                    onChange={(e) => handleDirectSettingChange('corsOrigins', e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Comma-separated list of allowed origins, or use * for all
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}