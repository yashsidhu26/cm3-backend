
import { moodleClient } from '../src/modules/academics/moodle.service';

const MOODLE_USERNAME = process.env.MOODLE_USERNAME;
const MOODLE_PASSWORD = process.env.MOODLE_PASSWORD;

async function testMoodleLogin() {
    console.log('----------------------------------------');
    console.log('    Moodle Direct Integration Test      ');
    console.log('----------------------------------------');

    let username = MOODLE_USERNAME;
    let password = MOODLE_PASSWORD;

    // Simple CLI argument parsing if env vars not set, or to override
    const args = process.argv.slice(2);
    if (args.length >= 2) {
        username = args[0];
        password = args[1];
    }

    if (!username || !password) {
        console.error('Error: Please provide username and password.');
        console.log('Usage:');
        console.log('  1. bun scripts/test-moodle-login.ts <username> <password>');
        console.log('  2. MOODLE_USERNAME=... MOODLE_PASSWORD=... bun scripts/test-moodle-login.ts');
        process.exit(1);
    }

    try {
        console.log(`\n1. Authenticating as '${username}'...`);
        const authResult = await moodleClient.authenticate(username, password);
        console.log('✅ Authentication successful!');
        console.log(`   - Token: ${authResult.token.substring(0, 10)}...`);
        console.log(`   - User ID: ${authResult.userId}`);

        console.log('\n2. Fetching courses...');
        const courses = await moodleClient.fetchCourses(authResult.token);
        console.log(`✅ Fetched ${courses?.length || 0} courses successfully!`);

        if (courses && courses.length > 0) {
            console.log('\n   Sample Courses:');
            courses.slice(0, 3).forEach(course => {
                console.log(`   - [${course.shortname}] ${course.fullname}`);
            });
        }

        console.log('\n----------------------------------------');
        console.log('✅ TEST PASSED');
        console.log('----------------------------------------');

    } catch (error: any) {
        console.error('\n❌ TEST FAILED');
        if (error.name === 'MoodleError') {
            console.error(`   Code: ${error.code}`);
            console.error(`   Message: ${error.message}`);
            console.error(`   Status: ${error.statusCode}`);
        } else {
            console.error('   Error:', error.message || error);
        }
        process.exit(1);
    }
}

testMoodleLogin();
