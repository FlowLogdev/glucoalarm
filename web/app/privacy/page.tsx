import type { Metadata } from "next";
import { LogoLink } from "../lib/Logo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How GlucoAlarm collects, uses, discloses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <LogoLink />
        <a className="btn-primary" href="/signup">
          Sign up
        </a>
      </nav>

      <div className="content-page">
        <h1>GlucoAlarm Privacy Policy</h1>
        <p className="meta">
          <strong>Effective Date: September 16, 2026</strong>
          <br />
          <strong>Last Updated: September 16, 2026</strong>
        </p>

        <p>
          GlucoAlarm (&ldquo;GlucoAlarm,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) respects your privacy and recognizes that glucose and health
          information is highly sensitive.
        </p>
        <p>
          This Privacy Policy explains how we collect, use, process, store, disclose, protect,
          and delete information when you use the GlucoAlarm mobile application, website, glucose
          monitoring features, reports, alerts, artificial intelligence features, caregiver or
          healthcare professional features, and related services (collectively, the
          &ldquo;Services&rdquo;).
        </p>
        <p>
          By using GlucoAlarm, you acknowledge the practices described in this Privacy Policy.
        </p>

        <h2>1. Information We Collect</h2>
        <p>The information we collect depends on which GlucoAlarm features you use.</p>

        <h2>Account and Profile Information</h2>
        <p>When you create or use a GlucoAlarm account, we may collect information such as:</p>
        <ul>
          <li>Name</li>
          <li>Email address</li>
          <li>Telephone number, if provided</li>
          <li>Account identifier</li>
          <li>Authentication information</li>
          <li>Profile information</li>
          <li>Account preferences</li>
          <li>Notification preferences</li>
          <li>Communications with GlucoAlarm support</li>
        </ul>
        <p>
          We use this information to create and maintain your account, authenticate you, provide
          customer support, communicate with you, and operate the Services.
        </p>

        <h2>2. Glucose and Health Information</h2>
        <p>
          GlucoAlarm may collect, receive, store, analyze, calculate, and display health-related
          information, including:
        </p>
        <ul>
          <li>Glucose readings</li>
          <li>Glucose reading timestamps</li>
          <li>High glucose events</li>
          <li>Low glucose events</li>
          <li>Glucose trends</li>
          <li>Average glucose</li>
          <li>Time in range</li>
          <li>Estimated A1C, GMI, or similar calculated metrics</li>
          <li>Carbohydrate information</li>
          <li>Insulin information</li>
          <li>Meal information</li>
          <li>Medication information you choose to enter</li>
          <li>Exercise or activity information you choose to enter</li>
          <li>Notes and other information you choose to provide</li>
          <li>Glucose reports</li>
          <li>Weekly and monthly summaries</li>
          <li>Patterns and trends generated from your glucose information</li>
          <li>AI-generated summaries and insights based on information available to GlucoAlarm</li>
        </ul>
        <p>
          We process this information to provide the health-monitoring, reporting, alert,
          analysis, and educational features you request.
        </p>

        <h2>3. Dexcom and Connected Glucose Services</h2>
        <p>
          GlucoAlarm may allow you to connect supported continuous glucose monitoring systems,
          including Dexcom services.
        </p>
        <p>
          When you choose to connect a supported glucose service, GlucoAlarm may receive
          information including:
        </p>
        <ul>
          <li>Glucose readings</li>
          <li>Reading timestamps</li>
          <li>Glucose trends</li>
          <li>CGM status information</li>
          <li>Account or connection identifiers</li>
          <li>Authentication credentials or authentication tokens necessary to maintain the connection</li>
        </ul>
        <p>
          If the GlucoAlarm implementation requires credentials to maintain a Dexcom Share
          connection, those credentials are used only for the purpose of establishing and
          maintaining the connection requested by you.
        </p>
        <p>
          We use security safeguards designed to protect stored authentication information and
          restrict access to authorized systems.
        </p>
        <p>
          GlucoAlarm does not control Dexcom or other third-party glucose services. Their services
          are subject to their own terms and privacy practices.
        </p>
        <p>
          You may stop GlucoAlarm from receiving future information from a connected service by
          disconnecting the integration where that functionality is available or by contacting
          us.
        </p>

        <h2>4. Information You Enter Manually</h2>
        <p>You may choose to enter additional information into GlucoAlarm, including:</p>
        <ul>
          <li>Carbohydrates</li>
          <li>Insulin</li>
          <li>Meals</li>
          <li>Medications</li>
          <li>Notes</li>
          <li>Health observations</li>
          <li>Glucose-related events</li>
          <li>Other information relating to your health management</li>
        </ul>
        <p>
          You are not required to provide optional information unless it is necessary for a
          feature you choose to use.
        </p>

        <h2>5. Caregivers, Family Members, Emergency Contacts, and Healthcare Professionals</h2>
        <p>GlucoAlarm may allow you to identify or authorize another individual, such as:</p>
        <ul>
          <li>A family member</li>
          <li>Caregiver</li>
          <li>Emergency contact</li>
          <li>Physician</li>
          <li>Nurse</li>
          <li>Diabetes educator</li>
          <li>Other healthcare professional</li>
        </ul>
        <p>If you use these features, we may collect information such as the person&apos;s:</p>
        <ul>
          <li>Name</li>
          <li>Email address</li>
          <li>Telephone number</li>
          <li>Relationship to you</li>
          <li>Access permissions</li>
        </ul>
        <p>
          When you expressly authorize another person to access your glucose or health
          information, GlucoAlarm may make the information covered by that authorization
          available to that person.
        </p>
        <p>You are responsible for choosing whom you authorize.</p>
        <p>Where available, you may revoke a person&apos;s access through your account settings.</p>

        <h2>6. Device and Technical Information</h2>
        <p>
          When you use GlucoAlarm, we may automatically receive limited technical information
          necessary to operate, secure, and troubleshoot the Services, including:
        </p>
        <ul>
          <li>Device type</li>
          <li>Operating system</li>
          <li>Application version</li>
          <li>IP address</li>
          <li>Device or application identifiers</li>
          <li>Push-notification token</li>
          <li>Login activity</li>
          <li>Authentication events</li>
          <li>Security events</li>
          <li>Application diagnostics</li>
          <li>Error information</li>
          <li>Crash information</li>
          <li>Performance information</li>
        </ul>
        <p>
          We use this information for security, fraud prevention, troubleshooting, application
          reliability, and operation of the Services.
        </p>

        <h2>7. Usage Information</h2>
        <p>We may collect limited information about how GlucoAlarm features are used, such as:</p>
        <ul>
          <li>Features accessed</li>
          <li>Reports generated</li>
          <li>Notification settings</li>
          <li>Application interactions</li>
          <li>Dates and times of activity</li>
          <li>Technical performance</li>
        </ul>
        <p>We do not use consumer health information for targeted advertising.</p>
        <p>We do not sell consumer health information.</p>

        <h2>8. Artificial Intelligence</h2>
        <p>
          GlucoAlarm may use artificial intelligence to help users better organize and understand
          their glucose information.
        </p>
        <p>AI-powered features may include:</p>
        <ul>
          <li>Summarizing glucose trends</li>
          <li>Preparing weekly reports</li>
          <li>Preparing monthly reports</li>
          <li>Identifying high and low patterns</li>
          <li>Explaining glucose statistics</li>
          <li>Generating educational observations</li>
          <li>Creating summaries that users may choose to discuss with healthcare professionals</li>
        </ul>
        <p>
          GlucoAlarm may use third-party artificial intelligence providers, including
          Anthropic&apos;s Claude, to process information required to provide these features.
        </p>
        <p>
          Depending on the feature requested, information sent for AI processing may include:
        </p>
        <ul>
          <li>Glucose readings</li>
          <li>Glucose statistics</li>
          <li>High and low events</li>
          <li>Time-in-range information</li>
          <li>Estimated health metrics</li>
          <li>User-entered information relevant to the requested analysis</li>
          <li>Questions or prompts submitted by the user</li>
        </ul>
        <p>
          We seek to limit information sent to AI providers to what is reasonably necessary to
          provide the requested feature.
        </p>
        <p>We do not intentionally send information to AI providers for targeted advertising.</p>
        <p>AI systems can produce inaccurate, incomplete, or inappropriate results.</p>
        <p>
          AI-generated information provided through GlucoAlarm is intended for informational and
          educational purposes and should not be treated as a medical diagnosis or medical
          treatment plan.
        </p>
        <p>
          You should discuss treatment decisions, medication changes, insulin dosing, or
          significant changes in diabetes management with an appropriately qualified healthcare
          professional.
        </p>

        <h2>9. Payments and Subscriptions</h2>
        <p>
          If you purchase a GlucoAlarm subscription or other paid service, payment or subscription
          information may be processed by third-party providers such as:
        </p>
        <ul>
          <li>Apple</li>
          <li>Stripe</li>
          <li>RevenueCat</li>
        </ul>
        <p>
          These providers may process transaction information, purchase status, subscription
          status, billing identifiers, and related information.
        </p>
        <p>
          When payment is processed directly by Apple or another payment processor, GlucoAlarm
          generally does not receive or store your complete payment-card number.
        </p>
        <p>Payment providers operate under their own privacy policies and terms.</p>

        <h2>10. Communications</h2>
        <p>GlucoAlarm may use service providers to send:</p>
        <ul>
          <li>Account verification messages</li>
          <li>Security notifications</li>
          <li>Password reset messages</li>
          <li>Glucose-related notifications</li>
          <li>Reports</li>
          <li>Transactional email</li>
          <li>SMS messages</li>
          <li>Customer-support communications</li>
        </ul>
        <p>Providers used for these purposes may include services such as:</p>
        <ul>
          <li>Twilio</li>
          <li>Resend</li>
          <li>Apple notification services</li>
          <li>Other communication infrastructure providers</li>
        </ul>
        <p>
          These providers receive only the information reasonably necessary to deliver the
          applicable communication.
        </p>

        <h2>11. Service Providers</h2>
        <p>We use third-party service providers to operate GlucoAlarm.</p>
        <p>Depending on the feature, current providers may include:</p>

        <p>
          <strong>Dexcom</strong>
          <br />
          Used to obtain glucose information when you connect a supported Dexcom service.
        </p>
        <p>
          <strong>Anthropic / Claude</strong>
          <br />
          Used to provide certain AI-assisted summaries, reports, and informational features.
        </p>
        <p>
          <strong>Apple</strong>
          <br />
          May provide App Store distribution, subscriptions, in-app purchases, push notifications,
          authentication, or other iOS services.
        </p>
        <p>
          <strong>Stripe</strong>
          <br />
          May be used for payment processing.
        </p>
        <p>
          <strong>RevenueCat</strong>
          <br />
          May be used to manage subscription and purchase status.
        </p>
        <p>
          <strong>Twilio</strong>
          <br />
          May be used to provide SMS or communication services.
        </p>
        <p>
          <strong>Resend</strong>
          <br />
          May be used to provide transactional email.
        </p>
        <p>
          <strong>Cloudflare</strong>
          <br />
          May be used for network, security, performance, and infrastructure services.
        </p>
        <p>
          <strong>Google</strong>
          <br />
          Certain Google services may be used for functionality such as authentication,
          infrastructure, communications, or other application services where applicable.
        </p>
        <p>We may change or add service providers as GlucoAlarm evolves.</p>
        <p>
          We expect service providers that process information on our behalf to use it only for
          authorized purposes and to provide appropriate protection for sensitive information.
        </p>

        <h2>12. How We Use Your Information</h2>
        <p>We may use personal and health information to:</p>
        <ul>
          <li>Create and maintain your account</li>
          <li>Authenticate users</li>
          <li>Connect GlucoAlarm to authorized CGM services</li>
          <li>Receive and display glucose information</li>
          <li>Calculate glucose statistics</li>
          <li>Identify glucose trends</li>
          <li>Generate reports</li>
          <li>Calculate estimated metrics such as estimated A1C or GMI</li>
          <li>Provide alerts and notifications</li>
          <li>Provide AI-assisted summaries</li>
          <li>Enable authorized caregiver or healthcare professional access</li>
          <li>Process subscriptions</li>
          <li>Communicate with users</li>
          <li>Provide customer support</li>
          <li>Diagnose technical problems</li>
          <li>Improve reliability and performance</li>
          <li>Protect accounts and systems</li>
          <li>Prevent fraud and misuse</li>
          <li>Investigate security incidents</li>
          <li>Comply with applicable legal obligations</li>
          <li>Enforce our Terms of Use</li>
        </ul>
        <p>
          We do not use consumer health information to determine eligibility for employment,
          housing, credit, insurance, or similar decisions.
        </p>

        <h2>13. We Do Not Sell Your Health Data</h2>
        <p>
          <strong>GlucoAlarm does not sell consumer health data.</strong>
        </p>
        <p>
          <strong>GlucoAlarm does not use consumer health data for targeted advertising.</strong>
        </p>
        <p>We do not provide glucose information to advertising networks for personalized advertising.</p>
        <p>
          If these practices ever materially change, we will update this Privacy Policy and
          obtain consent where required before implementing the new practice.
        </p>

        <h2>14. When We May Disclose Information</h2>
        <p>We may disclose information in the following circumstances.</p>

        <p>
          <strong>At Your Direction</strong>
        </p>
        <p>
          We may disclose information when you instruct us to do so, including when you authorize
          access by:
        </p>
        <ul>
          <li>A caregiver</li>
          <li>Family member</li>
          <li>Healthcare professional</li>
          <li>Connected application or service</li>
        </ul>

        <p>
          <strong>Service Providers</strong>
        </p>
        <p>
          We may provide information to vendors that process information on our behalf and that
          are necessary to operate GlucoAlarm.
        </p>

        <p>
          <strong>Legal Requirements</strong>
        </p>
        <p>We may disclose information when reasonably necessary to:</p>
        <ul>
          <li>Comply with applicable law</li>
          <li>Respond to a valid court order</li>
          <li>Respond to a legally valid subpoena</li>
          <li>Respond to lawful governmental requests</li>
          <li>Protect the rights and safety of GlucoAlarm, our users, or others</li>
          <li>Detect or investigate fraud or security incidents</li>
          <li>Establish, exercise, or defend legal claims</li>
        </ul>
        <p>
          We seek to limit disclosures to the information reasonably necessary for the applicable
          purpose.
        </p>

        <p>
          <strong>Business Transactions</strong>
        </p>
        <p>
          If GlucoAlarm is involved in a merger, acquisition, financing, reorganization,
          bankruptcy, sale of assets, or similar transaction, information may be transferred as
          part of that transaction subject to applicable law.
        </p>

        <h2>15. Data Retention</h2>
        <p>We retain personal and health information only for as long as reasonably necessary to:</p>
        <ul>
          <li>Maintain your GlucoAlarm account</li>
          <li>Provide the Services</li>
          <li>Provide features you request</li>
          <li>Maintain application security</li>
          <li>Prevent fraud</li>
          <li>Resolve disputes</li>
          <li>Meet legitimate business needs</li>
          <li>Meet applicable legal requirements</li>
        </ul>
        <p>
          Health information associated with an active account may generally remain available
          while the account remains active.
        </p>
        <p>
          When you request account deletion, we will delete, anonymize, or otherwise dispose of
          information associated with your account as required by applicable law, subject to
          limited exceptions.
        </p>
        <p>
          Certain information may remain temporarily in encrypted backups or archives until those
          backups are overwritten or deleted through our normal backup rotation.
        </p>
        <p>
          We may retain limited security, transaction, or legal records when retention is
          reasonably necessary or legally required.
        </p>

        <h2>16. Account and Data Deletion</h2>
        <p>You may request deletion of your GlucoAlarm account and associated personal information.</p>
        <p>Where supported in the application, you may initiate account deletion through:</p>
        <p>
          <strong>Settings &rarr; Account &rarr; Delete Account</strong>
        </p>
        <p>
          You may also contact: <a href="mailto:privacy@glucoalarm.com">privacy@glucoalarm.com</a>
        </p>
        <p>A deletion request generally includes deletion of:</p>
        <ul>
          <li>Account information</li>
          <li>Stored glucose information</li>
          <li>User-entered health information</li>
          <li>Reports associated with your account</li>
          <li>Saved caregiver or sharing relationships</li>
          <li>Other personal information associated with the account</li>
        </ul>
        <p>
          Some limited information may be retained when necessary to satisfy legal, security,
          fraud-prevention, accounting, or dispute-resolution obligations.
        </p>
        <p>
          Information stored in backup systems may remain temporarily until the applicable backup
          is deleted or overwritten.
        </p>
        <p>
          Deleting your GlucoAlarm account does not necessarily delete information held
          independently by Dexcom, Apple, Stripe, RevenueCat, Anthropic, or another third-party
          provider under that provider&apos;s own policies.
        </p>

        <h2>17. Your Privacy Rights</h2>
        <p>Depending on where you live, you may have the right to:</p>
        <ul>
          <li>Ask whether we process information about you</li>
          <li>Access personal information</li>
          <li>Obtain a copy of certain information</li>
          <li>Correct inaccurate personal information</li>
          <li>Request deletion</li>
          <li>Withdraw certain permissions or consent</li>
          <li>Disconnect a connected service</li>
          <li>Request information about certain disclosures</li>
          <li>Request information about third parties receiving your information</li>
          <li>Appeal certain privacy decisions when provided by applicable law</li>
        </ul>
        <p>
          To exercise a privacy right, contact: <a href="mailto:privacy@glucoalarm.com">privacy@glucoalarm.com</a>
        </p>
        <p>We may need to verify your identity before processing certain requests.</p>
        <p>We will not unlawfully discriminate against you because you exercise an applicable privacy right.</p>

        <h2>18. Security</h2>
        <p>
          Because GlucoAlarm processes sensitive health information, we use administrative,
          technical, and organizational safeguards designed to protect information against
          unauthorized access, loss, misuse, alteration, or disclosure.
        </p>
        <p>Depending on the system involved, safeguards may include:</p>
        <ul>
          <li>Encryption in transit</li>
          <li>Encryption of sensitive stored information</li>
          <li>Authentication controls</li>
          <li>Access restrictions</li>
          <li>Least-privilege access</li>
          <li>Security logging</li>
          <li>Secure credential handling</li>
          <li>Infrastructure security controls</li>
          <li>Secrets management</li>
          <li>Monitoring</li>
          <li>Backup protections</li>
          <li>Software-development security practices</li>
        </ul>
        <p>No internet-connected system or electronic storage system can guarantee absolute security.</p>
        <p>
          You are responsible for protecting your account password, device access, and other
          authentication credentials.
        </p>
        <p>Please contact us immediately if you believe your GlucoAlarm account has been compromised.</p>

        <h2>19. Security Incidents and Health Data Breaches</h2>
        <p>
          If GlucoAlarm discovers a security incident involving personal or health information, we
          will investigate the incident and take appropriate action.
        </p>
        <p>
          When notification is required by applicable law, we will notify affected individuals,
          government authorities, or other parties as required.
        </p>
        <p>
          Depending on the circumstances, federal or state health-data breach notification
          requirements may apply.
        </p>

        <h2>20. HIPAA</h2>
        <p>Health information is sensitive regardless of whether a particular privacy law applies.</p>
        <p>
          The Health Insurance Portability and Accountability Act (&ldquo;HIPAA&rdquo;) does not
          apply to every consumer health application or every piece of health information.
        </p>
        <p>
          Whether HIPAA applies to particular information can depend on factors including
          GlucoAlarm&apos;s relationship with healthcare providers, health plans, or other
          organizations regulated by HIPAA.
        </p>
        <p>
          If GlucoAlarm enters into an arrangement where it acts as a business associate of a
          HIPAA-covered entity, protected health information covered by that arrangement will be
          handled according to applicable legal and contractual requirements.
        </p>
        <p>
          Nothing in this Privacy Policy should be interpreted as a representation that every
          piece of information processed by GlucoAlarm is protected health information under
          HIPAA.
        </p>

        <h2>21. Medical and Safety Notice</h2>
        <p>
          GlucoAlarm is designed to help users organize, monitor, understand, and review
          glucose-related information.
        </p>
        <p>
          Unless a particular feature is expressly identified as legally authorized for a
          different purpose, information provided through GlucoAlarm is intended for
          informational and educational purposes.
        </p>
        <p>
          <strong>GlucoAlarm is not an emergency medical service.</strong>
        </p>
        <p>Do not rely on GlucoAlarm as your sole method for identifying or responding to:</p>
        <ul>
          <li>Severe hypoglycemia</li>
          <li>Severe hyperglycemia</li>
          <li>Diabetic ketoacidosis</li>
          <li>Loss of consciousness</li>
          <li>Another medical emergency</li>
        </ul>
        <p>
          If you believe you are experiencing a medical emergency, call <strong>911</strong> in
          the United States or your local emergency number.
        </p>
        <p>
          AI-generated information, calculated metrics, reports, and recommendations should not be
          used as the sole basis for:
        </p>
        <ul>
          <li>Changing insulin dosage</li>
          <li>Starting or stopping medication</li>
          <li>Changing prescribed treatment</li>
          <li>Diagnosing a medical condition</li>
          <li>Delaying emergency care</li>
        </ul>
        <p>Consult an appropriately qualified healthcare professional regarding medical decisions.</p>

        <h2>22. Estimated A1C and Other Calculations</h2>
        <p>
          GlucoAlarm may calculate estimated A1C, GMI, averages, trends, or similar metrics using
          available glucose information.
        </p>
        <p>These values are estimates.</p>
        <p>
          They are not laboratory test results and may differ from measurements obtained through
          laboratory testing or interpreted by a healthcare professional.
        </p>

        <h2>23. Third-Party Services</h2>
        <p>GlucoAlarm may contain integrations with services operated by third parties.</p>
        <p>Your use of a third-party service may be governed by that company&apos;s own:</p>
        <ul>
          <li>Terms of service</li>
          <li>Privacy policy</li>
          <li>Security practices</li>
          <li>Data retention practices</li>
        </ul>
        <p>GlucoAlarm does not control the independent privacy practices of third-party services.</p>
        <p>
          You should review the privacy information provided by services you choose to connect to
          GlucoAlarm.
        </p>

        <h2>24. Children and Minors</h2>
        <p>
          GlucoAlarm may be used by adults, including parents or legal guardians who use the
          Services to help monitor a minor&apos;s glucose information.
        </p>
        <p>Children under 13 should not independently create or manage a GlucoAlarm account.</p>
        <p>
          Where GlucoAlarm is used for a child, the parent or legal guardian should create or
          manage the relevant account and authorize the processing and sharing of the child&apos;s
          information.
        </p>
        <p>
          If we learn that a child under 13 provided personal information directly to GlucoAlarm
          without appropriate parental or guardian authorization, we will take reasonable steps to
          delete the information.
        </p>
        <p>Additional protections, consent requirements, and rights may apply when information concerns a minor.</p>

        <h2>25. Changes to This Privacy Policy</h2>
        <p>We may update this Privacy Policy as GlucoAlarm changes.</p>
        <p>We will update the &ldquo;Last Updated&rdquo; date when changes are made.</p>
        <p>
          If we make a material change affecting how sensitive health information is collected,
          used, or disclosed, we will provide additional notice or obtain consent when required by
          applicable law.
        </p>
        <p>You should periodically review this Privacy Policy.</p>

        <h2>26. Contact GlucoAlarm</h2>
        <p>
          Questions, privacy requests, account deletion requests, or concerns regarding this
          Privacy Policy may be submitted to:
        </p>
        <p>
          <strong>GlucoAlarm</strong>
          <br />
          Privacy Email: <a href="mailto:privacy@glucoalarm.com">privacy@glucoalarm.com</a>
          <br />
          Website: <a href="http://www.glucoalarm.com">www.glucoalarm.com</a>
        </p>

        <h2>27. Washington Consumer Health Data Privacy Notice</h2>
        <p>
          <strong>Washington My Health My Data Act</strong>
        </p>
        <p>
          This section supplements the rest of this Privacy Policy for consumer health data that
          is subject to the Washington My Health My Data Act.
        </p>

        <p>
          <strong>Consumer Health Data We Collect</strong>
        </p>
        <p>Depending on the GlucoAlarm features you use, consumer health data may include:</p>
        <ul>
          <li>Glucose readings</li>
          <li>Glucose timestamps</li>
          <li>Glucose trends</li>
          <li>High and low glucose events</li>
          <li>Time-in-range information</li>
          <li>Average glucose</li>
          <li>Estimated A1C, GMI, and similar calculated metrics</li>
          <li>Carbohydrate information</li>
          <li>Insulin information</li>
          <li>Meal information</li>
          <li>Medication information you choose to provide</li>
          <li>Exercise or activity information you choose to provide</li>
          <li>Health notes</li>
          <li>CGM information</li>
          <li>Information obtained from a connected health service</li>
          <li>Reports derived from health information</li>
          <li>Patterns and inferences derived from health information</li>
          <li>AI-generated summaries derived from health information</li>
        </ul>

        <p>
          <strong>Why We Collect Consumer Health Data</strong>
        </p>
        <p>We collect and use consumer health data to provide features requested by users, including:</p>
        <ul>
          <li>Displaying glucose information</li>
          <li>Monitoring glucose patterns</li>
          <li>Providing glucose-related alerts</li>
          <li>Calculating statistics</li>
          <li>Generating reports</li>
          <li>Providing weekly or monthly summaries</li>
          <li>Providing estimated health metrics</li>
          <li>Providing AI-assisted insights</li>
          <li>Enabling authorized sharing</li>
          <li>Synchronizing information from connected health services</li>
          <li>Providing customer support</li>
          <li>Maintaining and securing the Services</li>
        </ul>
        <p>
          We do not collect additional categories of consumer health data or use consumer health
          data for materially different purposes without providing notice and obtaining consent
          where required by law.
        </p>

        <p>
          <strong>Sources of Consumer Health Data</strong>
        </p>
        <p>Consumer health data may come from:</p>
        <ul>
          <li>You</li>
          <li>Dexcom or another CGM service that you connect</li>
          <li>Connected health applications or services</li>
          <li>Your device</li>
          <li>An authorized caregiver or healthcare professional when you request or authorize the interaction</li>
          <li>Information generated by GlucoAlarm from other consumer health data</li>
        </ul>

        <p>
          <strong>Consumer Health Data We Share</strong>
        </p>
        <p>
          We may share consumer health data only as reasonably necessary to provide services
          requested by the consumer, when directed or authorized by the consumer, or as otherwise
          permitted by applicable law.
        </p>
        <p>Depending on the feature, information may be shared with:</p>
        <ul>
          <li>Cloud and infrastructure service providers</li>
          <li>Database and hosting processors</li>
          <li>AI service providers</li>
          <li>Notification and communication providers</li>
          <li>CGM or health integration providers</li>
          <li>An authorized caregiver</li>
          <li>An authorized family member</li>
          <li>An authorized healthcare professional</li>
          <li>Security and technical service providers</li>
        </ul>

        <p>
          <strong>Third Parties and Affiliates</strong>
        </p>
        <p>
          Third-party providers that may process consumer health information for GlucoAlarm
          include, depending on the features you use:
        </p>
        <ul>
          <li>Dexcom</li>
          <li>Anthropic / Claude</li>
          <li>Cloudflare</li>
          <li>Twilio</li>
          <li>Resend</li>
          <li>Apple</li>
          <li>Google services used by GlucoAlarm</li>
          <li>Other infrastructure providers necessary to operate the feature requested by you</li>
        </ul>
        <p>
          Payment providers such as Stripe and RevenueCat may process transaction and subscription
          information. Health information is not intentionally provided to payment processors
          unless necessary for a specific requested service.
        </p>
        <p>GlucoAlarm does not sell consumer health data.</p>
        <p>GlucoAlarm does not use consumer health data for targeted advertising.</p>

        <p>
          <strong>Washington Consumer Rights</strong>
        </p>
        <p>Subject to applicable law, Washington consumers may have the right to:</p>
        <ul>
          <li>Confirm whether GlucoAlarm collects consumer health data concerning them.</li>
          <li>Confirm whether GlucoAlarm shares or sells consumer health data concerning them.</li>
          <li>Access consumer health data concerning them.</li>
          <li>Obtain information about third parties and affiliates with whom their consumer health data has been shared.</li>
          <li>Withdraw consent to future collection of consumer health data where collection is based on consent.</li>
          <li>Withdraw consent to future sharing of consumer health data where sharing is based on consent.</li>
          <li>Request deletion of consumer health data.</li>
          <li>Appeal a refusal to act on a consumer health data request.</li>
        </ul>

        <p>
          <strong>Exercising Washington Privacy Rights</strong>
        </p>
        <p>
          Submit a request through the GlucoAlarm application where an appropriate privacy control
          is available or email: <a href="mailto:privacy@glucoalarm.com">privacy@glucoalarm.com</a>
        </p>
        <p>We may use commercially reasonable methods to authenticate your identity before acting on a request.</p>
        <p>You are not required to create a new account solely to exercise applicable consumer health data rights.</p>

        <p>
          <strong>Withdrawal of Consent</strong>
        </p>
        <p>
          Where processing depends on your consent, you may withdraw consent to future collection
          or sharing of consumer health information.
        </p>
        <p>You may do this by:</p>
        <ul>
          <li>Disconnecting an applicable integration</li>
          <li>Revoking sharing permissions where available</li>
          <li>Adjusting applicable account settings</li>
          <li>Contacting <a href="mailto:privacy@glucoalarm.com">privacy@glucoalarm.com</a></li>
        </ul>
        <p>Withdrawal of consent may cause features requiring that information to stop working.</p>

        <p>
          <strong>Deletion of Washington Consumer Health Data</strong>
        </p>
        <p>
          When GlucoAlarm receives and authenticates an applicable Washington consumer health data
          deletion request, GlucoAlarm will take steps required by applicable law to delete the
          applicable consumer health data and notify relevant processors, contractors, affiliates,
          and third parties of the deletion request where required.
        </p>
        <p>
          Where consumer health data remains in archived or backup systems, deletion may occur
          through the applicable backup-management process in accordance with applicable law.
        </p>

        <p>
          <strong>Appeals</strong>
        </p>
        <p>
          If GlucoAlarm declines to take action on an applicable Washington consumer health data
          request, you may appeal the decision by emailing:{" "}
          <a href="mailto:privacy@glucoalarm.com">privacy@glucoalarm.com</a>
        </p>
        <p>
          Use the subject: <strong>Washington Privacy Appeal</strong>
        </p>
        <p>We will review the appeal and respond as required by applicable law.</p>
        <p>
          If an appeal is denied, we will provide information about available methods for
          submitting a complaint to the Washington Attorney General where required.
        </p>

        <p>
          <strong>Sale of Consumer Health Data</strong>
        </p>
        <p>
          <strong>GlucoAlarm does not sell consumer health data.</strong>
        </p>
        <p>
          If GlucoAlarm&apos;s practices regarding the sale of consumer health data ever change, we
          will update this policy and obtain legally required authorization before such a practice
          begins.
        </p>

        <h2>28. California and Other U.S. State Privacy Rights</h2>
        <p>
          Residents of California and certain other U.S. states may have additional privacy rights
          when applicable privacy laws apply to GlucoAlarm.
        </p>
        <p>Depending on applicable law, these rights may include:</p>
        <ul>
          <li>Knowing what categories of personal information are collected</li>
          <li>Accessing personal information</li>
          <li>Correcting inaccurate information</li>
          <li>Requesting deletion</li>
          <li>Obtaining a portable copy of certain information</li>
          <li>Limiting certain uses of sensitive personal information</li>
          <li>Opting out of certain sales or sharing</li>
          <li>Appealing certain decisions</li>
        </ul>
        <p>
          GlucoAlarm does not sell consumer health information and does not use consumer health
          information for targeted advertising.
        </p>
        <p>
          Requests may be submitted to: <a href="mailto:privacy@glucoalarm.com">privacy@glucoalarm.com</a>
        </p>

        <h2>29. Your Control Over Your Information</h2>
        <p>We believe users should maintain meaningful control over their health information.</p>
        <p>Depending on available GlucoAlarm functionality, you may be able to:</p>
        <ul>
          <li>Disconnect Dexcom or another connected service</li>
          <li>Stop sharing information with a caregiver</li>
          <li>Stop sharing information with a healthcare professional</li>
          <li>Modify notification settings</li>
          <li>Update account information</li>
          <li>Request access to information</li>
          <li>Request deletion</li>
          <li>Delete your account</li>
          <li>Withdraw certain permissions</li>
          <li>Stop using GlucoAlarm</li>
        </ul>
        <p>
          Contact <a href="mailto:privacy@glucoalarm.com">privacy@glucoalarm.com</a> if you need
          assistance exercising a privacy choice.
        </p>

        <p className="meta" style={{ marginTop: "2.5rem" }}>
          &copy; 2026 GlucoAlarm. All rights reserved.
        </p>
      </div>
    </div>
  );
}
