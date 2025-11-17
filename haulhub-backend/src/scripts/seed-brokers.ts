import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

/**
 * Script to seed initial broker data
 * Run with: npm run seed:brokers
 */
async function seedBrokers() {
  console.log('Starting broker seeding...');

  const tableName = process.env.DYNAMODB_TABLE_NAME || 'HaulHub-Table-dev';
  const region = process.env.AWS_REGION || 'us-east-1';
  const profile = process.env.AWS_PROFILE || 'haul-hub';

  // Use AWS profile from environment
  process.env.AWS_SDK_LOAD_CONFIG = '1';
  if (profile) {
    process.env.AWS_PROFILE = profile;
  }

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  const brokers = [
    { name: 'J.B. Hunt Transport Services' },
    { name: 'C.H. Robinson Worldwide' },
    { name: 'XPO Logistics' },
    { name: 'Schneider National' },
    { name: 'Landstar System' },
    { name: 'TQL (Total Quality Logistics)' },
    { name: 'Werner Enterprises' },
    { name: 'Old Dominion Freight Line' },
    { name: 'YRC Worldwide' },
    { name: 'Estes Express Lines' },
  ];

  try {
    for (const broker of brokers) {
      const brokerId = uuidv4();
      const now = new Date().toISOString();

      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: 'BROKER',
            SK: `BROKER#${brokerId}`,
            brokerId: brokerId,
            brokerName: broker.name,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        }),
      );

      console.log(`✓ Seeded broker: ${broker.name}`);
    }

    console.log('\n✅ Broker seeding completed successfully');
    console.log(`Total brokers seeded: ${brokers.length}`);
  } catch (error) {
    console.error('❌ Error seeding brokers:', error);
    process.exit(1);
  }
}

seedBrokers();
