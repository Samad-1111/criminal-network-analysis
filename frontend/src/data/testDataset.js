/**
 * Default test dataset for initial backend graph integration (Rajesh Kumar case).
 */
export const RAJESH_KUMAR_DATASET = {
  records: [
    {
      record_id: "CASE-001",
      timestamp: "2026-08-30T10:00:00",
      entities: [
        {
          entity_type: "Person",
          name: "Rajesh Kumar"
        },
        {
          entity_type: "Person",
          name: "Vikram Sharma"
        }
      ],
      relationships: [
        {
          source: "Rajesh Kumar",
          target: "Vikram Sharma",
          relationship_type: "OBSERVED_WITH",
          confidence: 0.95
        }
      ]
    },
    {
      record_id: "CASE-002",
      timestamp: "2026-08-31T10:00:00",
      entities: [
        {
          entity_type: "Person",
          name: "Rajesh Kumar"
        },
        {
          entity_type: "Person",
          name: "Amit Verma"
        }
      ],
      relationships: [
        {
          source: "Rajesh Kumar",
          target: "Amit Verma",
          relationship_type: "COMMUNICATED_WITH",
          confidence: 0.96
        }
      ]
    },
    {
      record_id: "CASE-003",
      timestamp: "2026-08-31T11:00:00",
      entities: [
        {
          entity_type: "Person",
          name: "Rajesh Kumar"
        },
        {
          entity_type: "Person",
          name: "Suresh Patel"
        }
      ],
      relationships: [
        {
          source: "Rajesh Kumar",
          target: "Suresh Patel",
          relationship_type: "ASSOCIATED_WITH",
          confidence: 0.94
        }
      ]
    }
  ],
  identity_results: []
};
