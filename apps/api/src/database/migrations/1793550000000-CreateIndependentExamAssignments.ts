import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIndependentExamAssignments1793550000000 implements MigrationInterface {
  name = 'CreateIndependentExamAssignments1793550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        CREATE TABLE independent_exam_assignments (
          id SERIAL PRIMARY KEY,
  
          student_id INTEGER NOT NULL
            REFERENCES students(id) ON DELETE RESTRICT,
  
          secretary_user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE RESTRICT,
  
          assigned_by_user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE RESTRICT,
  
          exam_date DATE NOT NULL,
  
          exam_session_code VARCHAR(100) NULL,
  
          note TEXT NULL,
  
          status VARCHAR(20) NOT NULL
            DEFAULT 'assigned',
  
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
          CONSTRAINT uq_independent_assignment_student_date
            UNIQUE (student_id, exam_date),
  
          CONSTRAINT chk_independent_assignment_status
            CHECK (status IN ('assigned', 'cancelled'))
        )
      `);

    await queryRunner.query(`
        CREATE INDEX idx_independent_assignment_secretary
        ON independent_exam_assignments (
          secretary_user_id,
          exam_date
        )
      `);

    await queryRunner.query(`
        CREATE INDEX idx_independent_assignment_date
        ON independent_exam_assignments (
          exam_date,
          status
        )
      `);

    await queryRunner.query(`
        CREATE TABLE independent_exam_assignment_events (
          id BIGSERIAL PRIMARY KEY,
  
          assignment_id INTEGER NOT NULL
            REFERENCES independent_exam_assignments(id)
            ON DELETE RESTRICT,
  
          actor_user_id INTEGER NOT NULL
            REFERENCES users(id) ON DELETE RESTRICT,
  
          action VARCHAR(30) NOT NULL,
  
          detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
          CONSTRAINT chk_independent_assignment_event_action
            CHECK (action IN (
              'assigned',
              'reassigned',
              'cancelled',
              'reactivated'
            ))
        )
      `);

    await queryRunner.query(`
        CREATE INDEX idx_independent_assignment_events
        ON independent_exam_assignment_events (
          assignment_id,
          created_at DESC
        )
      `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        DROP TABLE IF EXISTS independent_exam_assignment_events
      `);

    await queryRunner.query(`
        DROP TABLE IF EXISTS independent_exam_assignments
      `);
  }
}
