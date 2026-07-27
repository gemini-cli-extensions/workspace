-- Seed data for the database

-- Insert dashboard metrics
INSERT INTO dashboard_metrics (metric_name, metric_value, metric_type, category) VALUES
('Total Sessions', 1250, 'count', 'sessions'),
('Active Sessions', 823, 'count', 'sessions'),
('Session Growth Rate', 15.3, 'percentage', 'sessions'),
('Monthly Revenue', 45678.90, 'currency', 'revenue'),
('Revenue Growth', 8.5, 'percentage', 'revenue'),
('API Response Time', 145, 'time', 'performance'),
('Cache Hit Rate', 87.5, 'percentage', 'performance'),
('Database Load', 34.2, 'percentage', 'system'),
('CPU Usage', 23.8, 'percentage', 'system'),
('Memory Usage', 56.3, 'percentage', 'system'),
('Total Requests', 125430, 'count', 'performance'),
('Error Rate', 0.23, 'percentage', 'performance'),
('Success Rate', 99.77, 'percentage', 'performance'),
('Average Session Time', 342, 'time', 'sessions'),
('Conversion Rate', 4.2, 'percentage', 'revenue');

-- Insert sample health checks
INSERT INTO health_checks (service_name, status, response_time) VALUES
('api', 'healthy', 45),
('database', 'healthy', 12),
('workers-ai', 'healthy', 234),
('ai-gateway', 'healthy', 89),
('cdn', 'healthy', 23);
