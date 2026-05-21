# UI Design (Screen Definition): [SCREEN_NAME]

> **Note**: Replace everything in `< >` with project-specific values.

--- Sheet: History Change ---

## 1. Document Revision History

**Document Type**: Development Process
**Document Name**: Screen Definition

| Ver | Change Content  | Sheet Change | Update Reason    | PIC      | Change Date    |
| :-- | :-------------- | :----------- | :--------------- | :------- | :------------- |
| 1.0 | Initial version | All          | Initial Creation | `<NAME>` | `<YYYY-MM-DD>` |

--- Sheet: Screen Layout ---

## 2. Visual Layout Reference

**Document Type**: Development Process**Document Name**: Screen Definition

> **Screenshot / Mockup**: [Insert reference to Figma or screenshot here]

--- Sheet: Item Definition ---

## 3. Item Detail Specifications

### [Screen Items Mapping]

| No  | Item Name      | Control  | Init Value | Display Control<br />show/hide, <br />active/informat, sort | Required | Valid data                                   | Min | Max | Format | Logic | Remark | Transition | Source | Table/File | Column/Field | Remark | Source | Table/File | Column/Field | Remark    |
| --- | -------------- | -------- | ---------- | ----------------------------------------------------------- | -------- | -------------------------------------------- | --- | --- | ------ | ----- | ------ | ---------- | ------ | ---------- | ------------ | ------ | ------ | ---------- | ------------ | --------- |
| 1   | ユーザー管理   | Label    |            |                                                             |          |                                              |     |     |        |       |        |            |        |            |              |        |        |            |              |           |
| 2   | 絞り込み       | Label    |            |                                                             |          |                                              |     |     |        |       |        |            |        |            |              |        |        |            |              |           |
| 3   | メールアドレス | Text Box | NULL       | Placeholder                                                 |          | Half size<br />alphanumeric<br />and symbols |     |     | email  | No. 1 |        |            |        |            |              |        |        |            |              |           |
| 4   | 絞り込み       | Button   |            |                                                             |          |                                              |     |     |        | No. 2 |        |            |        |            |              |        |        |            |              |           |
| 5   | 新規追加       | Button   |            |                                                             |          |                                              |     |     |        | No. 3 |        |            |        |            |              |        |        |            |              |           |
| 6   | Pagination     | Paging   |            |                                                             |          |                                              |     |     |        | No. 4 |        |            |        |            |              |        |        |            |              |           |
| 7   | メールアドレス | Label    |            |                                                             |          |                                              |     |     |        |       |        |            |        |            |              |        |        |            |              |           |
| 8   | Email          | Text     |            |                                                             |          |                                              |     |     |        |       |        |            |        |            |              |        |        |            |              |           |
| 9   | 削除           | Button   |            |                                                             |          |                                              |     |     |        |       |        |            |        |            |              |        |        |            |              |           |
| 10  | 編集           | Button   |            |                                                             |          |                                              |     |     |        |       |        |            |        |            |              |        |        |            |              |           |
| 11  | Pagination     | Paging   |            |                                                             |          |                                              |     |     |        |       |        |            |        |            |              |        |        |            |              | same No.6 |

--- Sheet: Logic ---

## 4. Screen Business Logic

| No  | Logic Name        | Target Control  | Logic Flow                                                       | Target API / DB | Trigger Condition     |
| :-- | :---------------- | :-------------- | :--------------------------------------------------------------- | :-------------- | :-------------------- |
| 1.0 | **Submit Button** | `<PROCEED_BTN>` | Call `<LOGIN_API>` with ID and PW. Redirect to dashboard if 200. | `API: /login`   | Valid inputs required |
| 2.0 | **Reset Link**    | `<RESET_LINK>`  | Redirect user to Reset Password screen.                          | `<RESET_PATH>`  | On click              |

--- Sheet: Error Message ---

## 5. UI Error Messaging

| No  | Error Timing | Target Control  | Error Message Content                 | Note      |
| :-- | :----------- | :-------------- | :------------------------------------ | :-------- |
| 1.0 | Validation   | `<LOGIN_ID>`    | `Login ID is required.`               | -         |
| 2.0 | API Response | `<PROCEED_BTN>` | `Invalid ID or password.`             | -         |
| 3.0 | System       | Global          | `Connection error. Please try again.` | 5xx error |
