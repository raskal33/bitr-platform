# Requirements Document

## Introduction

This document outlines the requirements for fixing critical issues in the Bitredict backend system, specifically addressing problems with SportMonks fixture fetching, Oddyssey daily game persistence, API endpoints, cron job reliability, and prediction market creation processes.

## Requirements

### Requirement 1: Fix SportMonks Team Assignment Issues

**User Story:** As a system administrator, I want fixture data to have correct home/away team assignments and odds, so that prediction markets and daily games display accurate information.

#### Acceptance Criteria

1. WHEN SportMonks API returns fixture data THEN the system SHALL correctly identify home and away teams using meta.location fields
2. WHEN meta.location is not available THEN the system SHALL use array order as fallback (first participant = home, second = away)
3. WHEN odds are fetched THEN the system SHALL correctly map odds to the proper teams (home/draw/away)
4. WHEN fixture data is processed THEN the system SHALL validate team assignments before saving to database
5. WHEN team assignment fails THEN the system SHALL log detailed error information and skip the fixture

### Requirement 2: Implement Persistent Daily Game Storage

**User Story:** As a daily prediction game player, I want the same 10 matches to be available for the entire day, so that the game remains consistent regardless of fixture updates.

#### Acceptance Criteria

1. WHEN daily matches are selected THEN the system SHALL save exactly 10 matches for each game date
2. WHEN matches are saved for a date THEN the system SHALL never overwrite them, even if fixtures are updated
3. WHEN the frontend requests daily matches THEN the system SHALL return the pre-selected matches from persistent storage
4. WHEN no matches exist for a date THEN the system SHALL return an empty array rather than generating new matches
5. WHEN matches are selected THEN the system SHALL include complete odds data (1x2 and over/under 2.5)

### Requirement 3: Fix Oddyssey API Endpoints

**User Story:** As a frontend developer, I want reliable API endpoints that return Oddyssey matches in the correct format, so that the daily prediction game displays properly.

#### Acceptance Criteria

1. WHEN GET /api/oddyssey/matches is called THEN the system SHALL return matches from oddyssey.daily_game_matches table
2. WHEN no matches exist for the requested date THEN the system SHALL return an empty matches array with success: true
3. WHEN matches are returned THEN the system SHALL include all required fields (fixture_id, teams, odds, match_date, league_name)
4. WHEN database errors occur THEN the system SHALL return proper error responses with meaningful messages
5. WHEN matches are fetched THEN the system SHALL transform data to match frontend expectations

### Requirement 4: Improve Cron Job Reliability

**User Story:** As a system administrator, I want cron jobs to run reliably without conflicts or data corruption, so that the system operates smoothly in production.

#### Acceptance Criteria

1. WHEN cron jobs start THEN the system SHALL prevent concurrent execution of the same job type
2. WHEN fixtures are being fetched THEN the system SHALL use database locks to prevent duplicate operations
3. WHEN cron jobs fail THEN the system SHALL implement proper retry logic with exponential backoff
4. WHEN multiple schedulers run THEN the system SHALL coordinate execution order to prevent data conflicts
5. WHEN cron jobs complete THEN the system SHALL log detailed status information for monitoring

### Requirement 5: Ensure Production-Ready Prediction Market Creation

**User Story:** As a prediction market creator, I want the market creation process to be robust and handle edge cases, so that markets are created successfully in production.

#### Acceptance Criteria

1. WHEN creating prediction markets THEN the system SHALL validate all required data before blockchain interaction
2. WHEN market creation fails THEN the system SHALL provide detailed error messages and rollback any partial state
3. WHEN odds data is missing THEN the system SHALL either fetch missing data or gracefully handle the absence
4. WHEN blockchain transactions fail THEN the system SHALL implement proper retry mechanisms
5. WHEN markets are created THEN the system SHALL verify successful creation before marking as complete

### Requirement 6: Comprehensive System Health Monitoring

**User Story:** As a system administrator, I want comprehensive monitoring of all backend components, so that I can quickly identify and resolve issues.

#### Acceptance Criteria

1. WHEN system components run THEN the system SHALL provide health check endpoints for each service
2. WHEN errors occur THEN the system SHALL log structured error information with context
3. WHEN database operations fail THEN the system SHALL provide detailed connection and query error information
4. WHEN API endpoints are called THEN the system SHALL log request/response information for debugging
5. WHEN cron jobs execute THEN the system SHALL maintain execution logs with timing and success/failure status