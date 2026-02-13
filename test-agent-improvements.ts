/**
 * Test Agent Improvements
 * Verifies that agent only calls relevant tools
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SESSION_TOKEN = process.env.SESSION_TOKEN;

interface TestCase {
  name: string;
  query: string;
  expectedTools: string[];
  unexpectedTools: string[];
}

const TEST_CASES: TestCase[] = [
  {
    name: 'General knowledge - should not call any tools',
    query: 'What is 2+2?',
    expectedTools: [],
    unexpectedTools: ['get_enrolled_courses', 'get_course_resources', 'search_studydeck_resources'],
  },
  {
    name: 'Simple enrollment query - should only call get_enrolled_courses',
    query: 'What courses am I taking?',
    expectedTools: ['get_enrolled_courses'],
    unexpectedTools: ['get_course_resources', 'get_courses_full_details', 'search_studydeck_resources'],
  },
  {
    name: 'Greeting - should not call any tools',
    query: 'Hello!',
    expectedTools: [],
    unexpectedTools: ['get_enrolled_courses', 'get_course_resources'],
  },
];

async function testAgent() {
  console.log('🧪 Testing Agent Improvements\n');
  console.log('━'.repeat(60));

  if (!SESSION_TOKEN) {
    console.log('\n⚠️  No SESSION_TOKEN provided');
    console.log('To run tests, set SESSION_TOKEN environment variable:');
    console.log('SESSION_TOKEN=your-token bun test-agent-improvements.ts\n');
    return;
  }

  let passedTests = 0;
  let failedTests = 0;

  for (const testCase of TEST_CASES) {
    console.log(`\n📝 ${testCase.name}`);
    console.log(`Query: "${testCase.query}"`);
    console.log('Expected tools:', testCase.expectedTools.length === 0 ? 'none' : testCase.expectedTools.join(', '));
    console.log('Should NOT call:', testCase.unexpectedTools.join(', '));

    try {
      const response = await fetch(`${BASE_URL}/api/ai-integration/chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cookie': `super-app.session_token=${SESSION_TOKEN}`,
        },
        body: JSON.stringify({
          query: testCase.query,
          format: 'text',
        }),
      });

      if (response.status !== 200) {
        console.log(`❌ FAIL - Status ${response.status}`);
        const text = await response.text();
        console.log('Response:', text.substring(0, 200));
        failedTests++;
        continue;
      }

      // Read stream and collect tool calls
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const toolsCalled: string[] = [];
      let hasResponse = false;
      let timeout = false;

      const timeoutId = setTimeout(() => {
        timeout = true;
        reader.cancel();
      }, 15000); // 15 seconds timeout

      try {
        while (!timeout) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';

          for (const message of messages) {
            if (!message.trim()) continue;

            const lines = message.split('\n');
            let eventType = 'message';
            let data = '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                data = line.substring(5).trim();
              }
            }

            if (data) {
              try {
                const parsedData = JSON.parse(data);

                if (eventType === 'tool') {
                  toolsCalled.push(parsedData.tool);
                  console.log(`  → Tool called: ${parsedData.tool}`);
                }

                if (eventType === 'chunk') {
                  hasResponse = true;
                }

                if (eventType === 'complete' || eventType === 'error') {
                  clearTimeout(timeoutId);
                  reader.cancel();
                  break;
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }

      // Verify results
      let testPassed = true;
      const issues: string[] = [];

      // Check expected tools
      for (const expectedTool of testCase.expectedTools) {
        if (!toolsCalled.includes(expectedTool)) {
          issues.push(`Missing expected tool: ${expectedTool}`);
          testPassed = false;
        }
      }

      // Check unexpected tools
      for (const unexpectedTool of testCase.unexpectedTools) {
        if (toolsCalled.includes(unexpectedTool)) {
          issues.push(`Called unexpected tool: ${unexpectedTool}`);
          testPassed = false;
        }
      }

      // Check that response was generated
      if (!hasResponse) {
        issues.push('No response generated');
        testPassed = false;
      }

      if (testPassed) {
        console.log('✅ PASS');
        passedTests++;
      } else {
        console.log('❌ FAIL');
        for (const issue of issues) {
          console.log(`  ⚠️  ${issue}`);
        }
        console.log('  Actual tools called:', toolsCalled.length === 0 ? 'none' : toolsCalled.join(', '));
        failedTests++;
      }
    } catch (error: any) {
      console.log('❌ FAIL - Error:', error.message);
      failedTests++;
    }
  }

  console.log('\n━'.repeat(60));
  console.log('\n📊 Results:');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Success rate: ${Math.round((passedTests / TEST_CASES.length) * 100)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 All tests passed! Agent is now more selective about tool usage.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Check server logs for details.\n');
  }
}

testAgent().catch(console.error);
