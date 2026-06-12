import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Calendar,
  Building,
  Loader2,
  RefreshCw
} from 'lucide-react';

const AnalysisDashboard = ({ statementId, apiBaseUrl = '/api' }) => {
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch analysis data from API
  const fetchAnalysisData = async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await fetch(`${apiBaseUrl}/statements/${statementId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch analysis: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setAnalysisData(data);
    } catch (err) {
      console.error('Error fetching analysis data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (statementId) {
      fetchAnalysisData();
    }
  }, [statementId]);

  // Helper function to get severity color classes
  const getSeverityStyles = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return {
          bg: 'bg-red-100',
          border: 'border-red-500',
          text: 'text-red-800',
          icon: 'text-red-600',
          badge: 'bg-red-600'
        };
      case 'high':
        return {
          bg: 'bg-red-50',
          border: 'border-red-400',
          text: 'text-red-700',
          icon: 'text-red-500',
          badge: 'bg-red-500'
        };
      case 'medium':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-400',
          text: 'text-yellow-800',
          icon: 'text-yellow-600',
          badge: 'bg-yellow-500'
        };
      case 'low':
        return {
          bg: 'bg-green-50',
          border: 'border-green-400',
          text: 'text-green-800',
          icon: 'text-green-600',
          badge: 'bg-green-500'
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-400',
          text: 'text-gray-800',
          icon: 'text-gray-600',
          badge: 'bg-gray-500'
        };
    }
  };

  // Helper function to get appropriate icon for severity
  const getSeverityIcon = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return <XCircle className="w-5 h-5" />;
      case 'high':
        return <AlertCircle className="w-5 h-5" />;
      case 'medium':
        return <AlertTriangle className="w-5 h-5" />;
      case 'low':
        return <CheckCircle className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  // Format currency values
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format date values
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // Group alerts by severity for summary
  const getAlertSummary = (alerts) => {
    if (!alerts || !Array.isArray(alerts)) return {};
    
    return alerts.reduce((acc, alert) => {
      const severity = alert.severity?.toLowerCase() || 'unknown';
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {});
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-lg text-gray-600">Loading analysis data...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center">
              <XCircle className="w-6 h-6 text-red-600" />
              <h3 className="ml-3 text-lg font-semibold text-red-800">Error Loading Analysis</h3>
            </div>
            <p className="mt-2 text-red-700">{error}</p>
            <button
              onClick={() => fetchAnalysisData()}
              className="mt-4 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (!analysisData) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
              <h3 className="ml-3 text-lg font-semibold text-yellow-800">No Analysis Data</h3>
            </div>
            <p className="mt-2 text-yellow-700">No analysis data found for statement ID: {statementId}</p>
          </div>
        </div>
      </div>
    );
  }

  const { analysis, alerts = [], riskAnalysis, applicationData } = analysisData;
  const alertSummary = getAlertSummary(alerts);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Statement Analysis Dashboard</h1>
            <p className="mt-1 text-gray-600">Statement ID: {statementId}</p>
          </div>
          <button
            onClick={() => fetchAnalysisData(true)}
            disabled={refreshing}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Alert Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center">
              <XCircle className="w-8 h-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Critical Alerts</p>
                <p className="text-2xl font-bold text-red-600">{alertSummary.critical || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">High Alerts</p>
                <p className="text-2xl font-bold text-red-500">{alertSummary.high || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center">
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Medium Alerts</p>
                <p className="text-2xl font-bold text-yellow-600">{alertSummary.medium || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Low Alerts</p>
                <p className="text-2xl font-bold text-green-600">{alertSummary.low || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Analysis Summary */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Analysis Summary</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Financial Summary */}
            <div className="space-y-2">
              <div className="flex items-center text-gray-600">
                <DollarSign className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">Financial Overview</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  Total Deposits: <span className="font-semibold text-gray-900">
                    {formatCurrency(analysis?.financialSummary?.totalDeposits || analysis?.totalDeposits)}
                  </span>
                </p>
                <p className="text-sm text-gray-600">
                  Average Balance: <span className="font-semibold text-gray-900">
                    {formatCurrency(riskAnalysis?.averageBalance)}
                  </span>
                </p>
                <p className="text-sm text-gray-600">
                  Minimum Balance: <span className="font-semibold text-gray-900">
                    {formatCurrency(riskAnalysis?.minimumBalance)}
                  </span>
                </p>
              </div>
            </div>

            {/* Risk Analysis */}
            <div className="space-y-2">
              <div className="flex items-center text-gray-600">
                <TrendingUp className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">Risk Analysis</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  Risk Score: <span className="font-semibold text-gray-900">
                    {riskAnalysis?.riskScore || 'N/A'}
                  </span>
                </p>
                <p className="text-sm text-gray-600">
                  NSF Count: <span className="font-semibold text-gray-900">
                    {riskAnalysis?.nsfCount || 0}
                  </span>
                </p>
                <p className="text-sm text-gray-600">
                  Period Days: <span className="font-semibold text-gray-900">
                    {analysis?.balanceAnalysis?.periodDays || 'N/A'}
                  </span>
                </p>
              </div>
            </div>

            {/* Business Information */}
            {applicationData && (
              <div className="space-y-2">
                <div className="flex items-center text-gray-600">
                  <Building className="w-4 h-4 mr-2" />
                  <span className="text-sm font-medium">Business Info</span>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">
                    Business: <span className="font-semibold text-gray-900">
                      {applicationData.businessName || 'N/A'}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Requested: <span className="font-semibold text-gray-900">
                      {formatCurrency(applicationData.requestedAmount)}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Industry: <span className="font-semibold text-gray-900">
                      {applicationData.industry || 'N/A'}
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="space-y-2">
              <div className="flex items-center text-gray-600">
                <Calendar className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">Timeline</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  Analyzed: <span className="font-semibold text-gray-900">
                    {formatDate(analysisData.createdAt || analysisData.timestamp)}
                  </span>
                </p>
                {applicationData?.businessStartDate && (
                  <p className="text-sm text-gray-600">
                    Business Start: <span className="font-semibold text-gray-900">
                      {formatDate(applicationData.businessStartDate)}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Alerts List */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Generated Alerts</h2>
            <span className="text-sm text-gray-600">
              {alerts.length} alert{alerts.length !== 1 ? 's' : ''} found
            </span>
          </div>

          {alerts.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No Alerts Generated</h3>
              <p className="text-gray-600">This statement analysis passed without any alerts.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert, index) => {
                const styles = getSeverityStyles(alert.severity);
                const icon = getSeverityIcon(alert.severity);
                
                return (
                  <div
                    key={index}
                    className={`${styles.bg} ${styles.border} border-l-4 rounded-r-lg p-4 transition-all hover:shadow-md`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={styles.icon}>
                        {icon}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <h3 className={`font-semibold ${styles.text}`}>
                              {alert.code || `Alert ${index + 1}`}
                            </h3>
                            <span
                              className={`${styles.badge} text-white text-xs px-2 py-1 rounded-full uppercase font-medium`}
                            >
                              {alert.severity}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {formatDate(alert.timestamp)}
                          </span>
                        </div>
                        
                        <p className={`mt-1 ${styles.text}`}>
                          {alert.message}
                        </p>
                        
                        {/* Alert Data Details */}
                        {alert.data && Object.keys(alert.data).length > 0 && (
                          <div className="mt-3 bg-white bg-opacity-50 rounded p-3">
                            <h4 className="text-xs font-medium text-gray-700 mb-2">Alert Data:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                              {Object.entries(alert.data).map(([key, value]) => (
                                <div key={key} className="flex justify-between">
                                  <span className="text-gray-600 capitalize">
                                    {key.replace(/([A-Z])/g, ' $1').trim()}:
                                  </span>
                                  <span className="font-medium text-gray-900">
                                    {typeof value === 'number' && key.toLowerCase().includes('amount') 
                                      ? formatCurrency(value)
                                      : typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)
                                      ? formatDate(value)
                                      : String(value)
                                    }
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Raw Data Section (Collapsible) */}
        <details className="bg-white rounded-lg border">
          <summary className="p-6 cursor-pointer hover:bg-gray-50 transition-colors">
            <span className="text-lg font-semibold text-gray-900">Raw Analysis Data</span>
            <span className="ml-2 text-sm text-gray-600">(Click to expand)</span>
          </summary>
          <div className="px-6 pb-6">
            <pre className="bg-gray-100 rounded p-4 text-xs overflow-auto max-h-96">
              {JSON.stringify(analysisData, null, 2)}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
};

export default AnalysisDashboard;
