"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
async function seedBrokers() {
    console.log('Starting broker seeding...');
    const tableName = process.env.DYNAMODB_TABLE_NAME || 'HaulHub-Table-dev';
    const region = process.env.AWS_REGION || 'us-east-1';
    const profile = process.env.AWS_PROFILE || 'haul-hub';
    process.env.AWS_SDK_LOAD_CONFIG = '1';
    if (profile) {
        process.env.AWS_PROFILE = profile;
    }
    const client = new client_dynamodb_1.DynamoDBClient({ region });
    const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
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
            const brokerId = (0, uuid_1.v4)();
            const now = new Date().toISOString();
            await docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: tableName,
                Item: {
                    PK: `BROKER#${brokerId}`,
                    SK: 'METADATA',
                    id: brokerId,
                    name: broker.name,
                    isActive: true,
                    createdAt: now,
                    updatedAt: now,
                },
            }));
            console.log(`✓ Seeded broker: ${broker.name}`);
        }
        console.log('\n✅ Broker seeding completed successfully');
        console.log(`Total brokers seeded: ${brokers.length}`);
    }
    catch (error) {
        console.error('❌ Error seeding brokers:', error);
        process.exit(1);
    }
}
seedBrokers();
//# sourceMappingURL=seed-brokers.js.map