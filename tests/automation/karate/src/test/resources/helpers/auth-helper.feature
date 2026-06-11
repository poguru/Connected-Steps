@ignore
Feature: Authentication Helper

  Scenario: Login and return session cookie
    Given url baseUrl
    And path '/api/auth/login'
    And request { email: '#(email)', password: '#(password)' }
    When method POST
    Then status 200
    * def authCookie = responseCookies['session'] || responseCookies['sb-access-token'] || ''
    * def authHeader = response.token || ''
