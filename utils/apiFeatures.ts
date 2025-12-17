class APIFeatures {
  query: any;
  queryString: any;
  totalCount: number | null = null;
  searchConditions: any = null;

  constructor(query: any, queryString: any) {
    this.query = query;
    this.queryString = queryString;
  }

  search() {
    if (this.queryString.search) {
      const searchTerm = this.queryString.search;
      const searchRegex = { $regex: searchTerm, $options: 'i' }; // Case-insensitive search

      // Store search conditions to merge with filter conditions
      this.searchConditions = {
        $or: [
          { carRegistrationNumber: searchRegex },
          { phoneNumber: searchRegex },
          { color: searchRegex },
          { vehicleType: searchRegex },
          { note: searchRegex }
        ]
      };
    }

    return this;
  }

  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
    excludedFields.forEach(el => delete queryObj[el]);

    // 1B) Advanced filtering
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    const filterConditions = JSON.parse(queryStr);

    // Merge search conditions with filter conditions
    let finalConditions = filterConditions;
    if (this.searchConditions) {
      if (Object.keys(filterConditions).length > 0) {
        // Both search and filter conditions exist - combine with $and
        finalConditions = {
          $and: [
            this.searchConditions,
            filterConditions
          ]
        };
      } else {
        // Only search conditions exist
        finalConditions = this.searchConditions;
      }
    }

    this.query = this.query.find(finalConditions);

    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }

    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      this.query = this.query.select('-__v');
    }

    return this;
  }

  async paginate() {
    const page = this.queryString.page * 1 || 1;
    const limit = this.queryString.limit * 1 || 100;
    const skip = (page - 1) * limit;

    // Calculate total count before applying pagination
    // Get the model and query conditions to count documents
    // Note: populate() doesn't affect count, so we only need the base query conditions
    const model = this.query.model;
    const queryConditions = this.query.getQuery();

    // Count documents with the same filters (before pagination)
    this.totalCount = await model.countDocuments(queryConditions);

    // Apply pagination to the main query
    this.query = this.query.skip(skip).limit(limit);

    return this;
  }
}
export default APIFeatures;
