@smoke @regression
Feature: Membership & Payments API

  Background:
    Given url baseUrl
    * def loginResult = call read('classpath:helpers/auth-helper.feature') { email: '#(testEmail)', password: '#(testPassword)' }
    * def cookie = loginResult.authCookie

  @smoke
  Scenario: TC-API-MEM01 | GET /api/membership returns active field
    Given path '/api/membership'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response contains { active: '#boolean' }

  Scenario: TC-API-MEM02 | Unauthenticated /api/membership returns 401
    Given path '/api/membership'
    When method GET
    Then status 401

  Scenario: TC-API-MEM03 | Create order for monthly plan returns Razorpay order
    Given path '/api/payment/create-order'
    And cookie session = cookie
    And request { plan: 'monthly' }
    When method POST
    Then status 200
    And match response contains { id: '#notnull', amount: '#number' }
    And match response.id startsWith 'order_'

  Scenario: TC-API-MEM04 | Payment verify rejects tampered signature
    Given path '/api/payment/verify'
    And cookie session = cookie
    And request { razorpay_order_id: 'order_fake', razorpay_payment_id: 'pay_fake', razorpay_signature: 'TAMPERED' }
    When method POST
    Then status 400
    And match response.error contains '#notnull'

  Scenario: TC-API-MEM05 | Invalid coupon returns valid:false
    Given path '/api/coupons/validate'
    And cookie session = cookie
    And request { code: 'INVALID-XYZ-999', plan: 'monthly' }
    When method POST
    Then status 200
    And match response contains { valid: false }

  Scenario: TC-API-MEM06 | Create order with invalid plan returns 400
    Given path '/api/payment/create-order'
    And cookie session = cookie
    And request { plan: 'invalid_plan_xyz' }
    When method POST
    Then status 400

  Scenario: TC-API-MEM07 | GET /api/user/payments returns payment history
    Given path '/api/user/payments'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response == '#array'

  @security
  Scenario: TC-API-MEM08 | Payment verify without auth returns 401
    Given path '/api/payment/verify'
    And request { razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x', razorpay_signature: 'sig' }
    When method POST
    Then status 401
