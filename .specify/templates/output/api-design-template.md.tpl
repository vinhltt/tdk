# API Design: [API_ENDPOINT_NAME]

> **Note**: Replace everything in `< >` with project-specific values.

--- Sheet: History ---

## 1. Revision History

| No  | Date         | Ver   | Content         | Updated By | Origin | Updated Sheet(s) |
| :-- | :----------- | :---- | :-------------- | :--------- | :----- | :--------------- |
| 1.0 | <YYYY/MM/DD> | 1.0.0 | Initial version | `<NAME>`   | -      | All              |

--- Sheet: InputOutput ---

## 2. API Contract

### 2.1 Request Details

**Method**: `GET / POST / PUT / DELETE`
**URI**: `/api/v1/<RESOURCE_NAME>/<PARAM_ID>`

| Parameter Type | Key           | Type           | Description                   | Required |
| :------------- | :------------ | :------------- | :---------------------------- | :------- |
| Path Param     | `<PARAM_ID>`  | `int / string` | The unique ID of the resource | ○        |
| Query Param    | `<QUERY_KEY>` | `int / string` | Filter by `<FIELD>`           | ×        |

### 2.2 Response Details

| Success / Failure | Status Code        | Content-Type       | Response Body (JSON)           | Note                  |
| :---------------- | :----------------- | :----------------- | :----------------------------- | :-------------------- |
| **Success**       | `200 OK`           | `application/json` | `{ "data": <RES_DATA> }`       | Request successful    |
| **User Error**    | `400 Bad Request`  | `application/json` | `{ "error": "Invalid field" }` | Invalid input         |
| **Auth Error**    | `401 Unauthorized` | `application/json` | `{ "error": "Invalid token" }` | Missing/Expired token |
| **Not Found**     | `404 Not Found`    | `application/json` | `{ "error": "Not Found" }`     | Resource not exists   |

--- Sheet: Validation ---

## 3. Input Validation Rules

| No  | Field Name     | Required? | Validation Rule                   | Message             | Note                   |
| :-- | :------------- | :-------- | :-------------------------------- | :------------------ | :--------------------- |
| 1   | `<FIELD_ID>`   | ○         | Must be a valid ID from `<TABLE>` | `ID does not exist` | Master existence check |
| 2   | `<FIELD_NAME>` | ○ / ×     | `<REG_EX / FORMAT>`               | `<ERROR_MESSAGE>`   | `<DETAILS>`            |

--- Sheet: Detail ---

## 4. Business Logic Flow

### [API Objective: Description of what this API does]

| Step | Function                | Overview                                    | Note                    |
| :--- | :---------------------- | :------------------------------------------ | :---------------------- |
| 1.0  | User Authenticate       | Check user authentication and permissions   | Return 401 if invalid   |
| 2.0  | Validation request data | Check query parameters and request body     | Return 400 if invalid   |
| 3.0  | DB Query get list data  | Query the `<TABLE_NAME>` for requested data | Return 404 if not found |
| 4.0  | Response data           | Construct and return the DTO object         | -                       |

**Detailed Logic Steps**:

**1. User Authenticate**:

- Send POST request to `<AUTH_URL>` with client credentials.
- If Auth fails, return errors

**2. Validation request data**

- If validate reqeust data fails, return errors

**3. DB Query get list data**

- Map each record to the local schema.
- If record already exists in `<TABLE>`, update it; otherwise, insert.

**4. Response data**

- Construct and return the DTO object

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

## 6. Database I/O Mapping

| No  | Action         | Table Name | Column Name | Filter / Condition | Source / Registered Details |
| :-- | :------------- | :--------- | :---------- | :----------------- | :-------------------------- |
| 1   | Check Existing | `<TABLE>`  | `id`        | `id = <VALUE>`     | Source API `<FIELD>`        |
| 2   | Insert Record  | `<TABLE>`  | `status`    | -                  | Set as 'PROCESSING'         |
