function fn() {
  var env = karate.env || 'local';
  karate.log('Environment:', env);

  var config = {
    env: env,
    baseUrl: 'http://localhost:3000',
    adminPassword: '',
    cronSecret: '',
    testEmail: 'qa-user@connectedsteps.test',
    testPassword: 'QaTest@123',
    testEmail2: 'qa-user2@connectedsteps.test',
  };

  if (env === 'staging') {
    config.baseUrl = java.lang.System.getenv('STAGING_URL') || 'https://staging.connectedsteps.in';
  } else if (env === 'production') {
    config.baseUrl = java.lang.System.getenv('PROD_URL') || 'https://www.connectedsteps.in';
  }

  // Override from system properties / env vars
  var envBaseUrl     = java.lang.System.getenv('BASE_URL');
  var envAdminPwd    = java.lang.System.getenv('ADMIN_PASSWORD');
  var envCronSecret  = java.lang.System.getenv('CRON_SECRET');
  var envTestEmail   = java.lang.System.getenv('TEST_EMAIL');
  var envTestPwd     = java.lang.System.getenv('TEST_PASSWORD');

  if (envBaseUrl)    config.baseUrl       = envBaseUrl;
  if (envAdminPwd)   config.adminPassword = envAdminPwd;
  if (envCronSecret) config.cronSecret    = envCronSecret;
  if (envTestEmail)  config.testEmail     = envTestEmail;
  if (envTestPwd)    config.testPassword  = envTestPwd;

  // Shared auth helper callable from any feature
  config.getAuthCookie = function(email, password) {
    var result = karate.call('classpath:helpers/auth-helper.feature',
      { email: email, password: password });
    return result.authCookie;
  };

  return config;
}
