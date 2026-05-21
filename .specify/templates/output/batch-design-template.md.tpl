# Batch Design: [BATCH_NAME]

> **Note**: Replace all values in `< >` with project-specific details.

--- Sheet: History ---

## 1. Revision History

| No  | Date         | Ver   | Content         | Updated By | Origin | Updated Sheet(s) |
| :-- | :----------- | :---- | :-------------- | :--------- | :----- | :--------------- |
| 1.0 | <YYYY/MM/DD> | 1.0.0 | Initial version | `<NAME>`   | -      | All              |

--- Sheet: InputOutput ---

## 2. Input / Output Specifications

### 2.1 Batch Entry Parameters

| Parameter Type | Key           | Type     | Description / Default Value               |
| :------------- | :------------ | :------- | :---------------------------------------- |
| Option         | `target_date` | `date`   | Target date to process (e.g., YYYY-MM-DD) |
| Mandatory      | `<PARAMETER>` | `<TYPE>` | `<DESCRIPTION>`                           |

### 2.2 Execution Log Results

| Status      | Value / Code | Message Template                   |
| :---------- | :----------- | :--------------------------------- |
| **Success** | `200`        | `<ID> processed successfully`      |
| **Failure** | `4XX / 5XX`  | `Failed to process <ID>: <REASON>` |

--- Sheet: Validation ---

## 3. Input Validation Rules

| No  | Field Name    | Required | Type Check | Character / Length Spec | Validation Rule           | Error Message         |
| :-- | :------------ | :------- | :--------- | :---------------------- | :------------------------ | :-------------------- |
| 1   | `target_date` | ○        | Date       | YYYY-MM-DD              | Must be valid date format | `Invalid date format` |
| 2   | `<FIELD>`     | ○/×      | `<TYPE>`   | `<SPEC>`                | `<LOGIC>`                 | `<MESSAGE>`           |

--- Sheet: Detail ---

## 4. Business Logic Flow

### [Batch Objective: Description of what this batch does]

| Step | Function           | Overview                              | Note                      |
| :--- | :----------------- | :------------------------------------ | :------------------------ |
| 1.0  | Fetch data         | Retrieve records from source system   | Handle pagination/retries |
| 2.0  | Process and update | Transform and validate retrieved data | Skip invalid records      |
| 3.0  | Persist data       | Update database with processed data   | Transactional             |

**Detailed Logic Steps**:

**1. Fetch Data**:

- Retrieve records from `<API_URL>` using `<PARAMETERS>`.
- Iterate through pagination until all records are retrieved (limit `<N>`).

**2. Process and Update**:

- Map each record to the local schema.
- If record already exists in `<TABLE>`, update it; otherwise, insert.

**3. Persist data**:

- Update database with processed data

--- Sheet: Database ---

## 5. Database Schema

### Tables create/ update

#### Table: `<TABLE_NAME>`

```sql
CREATE TABLE `<TABLE_NAME>` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `<COLUMN>` VARCHAR(50) NOT NULL,
    `status` ENUM('PROCESSING', 'SUCCESS', 'FAILED') NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

--- Sheet: DB InputOutput ---

## 6. Database I/O Mapping

| No  | Action         | Table Name | Column Name | Filter / Condition | Source / Registered Details |
| :-- | :------------- | :--------- | :---------- | :----------------- | :-------------------------- |
| 1   | Check Existing | `<TABLE>`  | `id`        | `id = <VALUE>`     | Source API `<FIELD>`        |
| 2   | Insert Record  | `<TABLE>`  | `status`    | -                  | Set as 'PROCESSING'         |
