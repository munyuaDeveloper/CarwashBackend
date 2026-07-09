import { Response, NextFunction } from 'express';
import { IRequestWithUser } from '../types';
import Booking from '../models/bookingModel';
import User from '../models/userModel';
import Wallet from '../models/walletModel';
import Customer from '../models/customerModel';
import Vehicle from '../models/vehicleModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import APIFeatures from '../utils/apiFeatures';
import Business from '../models/businessModel';
import { calculateDiscountFromPoints, processCompletedBookingLoyalty } from '../utils/loyaltyService';
import {
  ensureCustomerRegistration,
  ensureVehicleCustomerRegistration,
  ensureVehicleRegistration,
  linkCustomerToVehicle
} from '../utils/customerVehicleService';
import { normalizePhoneForStorage, normalizePlate } from '../utils/contactNormalization';
import { userHasRole } from '../utils/userRoles';

const resolveLoyaltyRedemptionFields = async (
  businessId: string,
  loyaltyPointsRedeemed?: number
): Promise<{ loyaltyPointsRedeemed: number; loyaltyDiscountKes: number; isRewardWash: boolean }> => {
  const points = Math.max(0, Number(loyaltyPointsRedeemed || 0));
  if (points === 0) {
    return { loyaltyPointsRedeemed: 0, loyaltyDiscountKes: 0, isRewardWash: false };
  }

  const business = await Business.findById(businessId).select('loyaltySettings');
  const settings = business?.['loyaltySettings'];
  const redemptionPoints = Math.max(1, Number(settings?.redemptionPoints ?? 500));
  const redemptionValueKes = Math.max(1, Number(settings?.redemptionValueKes ?? 500));

  return {
    loyaltyPointsRedeemed: points,
    loyaltyDiscountKes: calculateDiscountFromPoints(points, redemptionPoints, redemptionValueKes),
    isRewardWash: true
  };
};

const attachBookingPopulates = (query: any) => {
  if (!query) {
    return query;
  }

  return query
    .populate('attendant', 'name email role')
    .populate({
      path: 'vehicle',
      select: 'plate vehicleType customer',
      populate: { path: 'customer', select: 'name phoneNumber smsConsent vehiclePlate' }
    })
    .populate('customer', 'name phoneNumber smsConsent vehiclePlate');
};

const bookingController = {
  createBooking: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const {
      carRegistrationNumber,
      phoneNumber,
      color,
      attendant,
      amount,
      serviceType,
      vehicleType,
      category,
      paymentType,
      note,
      vehicleId,
      customerId,
      customerPhoneNumber,
      customerName,
      smsConsent,
      isRewardWash,
      loyaltyPointsRedeemed
    } = req.body;

    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }

    // Validate required fields
    if (!attendant || amount === undefined || amount === null || !category || !paymentType) {
      return next(new AppError('Required fields: attendant, amount, category, paymentType', 400));
    }

    // Validate category
    if (!['vehicle', 'carpet'].includes(category)) {
      return next(new AppError('Category must be either "vehicle" or "carpet"', 400));
    }

    // Validate category-specific fields
    if (category === 'vehicle') {
      if (!serviceType || !['full wash', 'half wash'].includes(serviceType)) {
        return next(new AppError('Service type must be either "full wash" or "half wash"', 400));
      }
      if (!vehicleType || !String(vehicleType).trim()) {
        return next(new AppError('vehicleType is required for vehicle bookings', 400));
      }

      const trimmedVehicleId =
        typeof vehicleId === 'string' && /^[0-9a-fA-F]{24}$/.test(vehicleId.trim()) ? vehicleId.trim() : '';
      const trimmedLegacyCustomerId =
        typeof customerId === 'string' && /^[0-9a-fA-F]{24}$/.test(customerId.trim()) ? customerId.trim() : '';

      if (!trimmedVehicleId && !trimmedLegacyCustomerId && (!carRegistrationNumber || !String(carRegistrationNumber).trim())) {
        return next(
          new AppError(
            'For vehicle bookings provide vehicleId, legacy customerId with stored plate, or carRegistrationNumber',
            400
          )
        );
      }
    }
    if (category === 'carpet') {
      if (!phoneNumber || !String(phoneNumber).trim() || !color || !String(color).trim()) {
        return next(new AppError('For carpet bookings: phoneNumber and color are required', 400));
      }
    }

    // Validate payment type
    if (!['attendant_cash', 'admin_cash', 'admin_till'].includes(paymentType)) {
      return next(new AppError('Payment type must be either "attendant_cash", "admin_cash", or "admin_till"', 400));
    }

    const redemptionPointsRequested = Math.max(0, Number(loyaltyPointsRedeemed || 0));
    const rewardWashRequested = Boolean(isRewardWash) || redemptionPointsRequested > 0;

    // Validate amount
    if (amount < 0) {
      return next(new AppError('Amount cannot be negative', 400));
    }
    if (amount === 0 && !rewardWashRequested) {
      return next(new AppError('Amount must be greater than 0', 400));
    }

    // Validate ObjectId format
    if (!attendant.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new AppError('Invalid attendant ID format', 400));
    }

    // Check if attendant exists
    const attendantExists = await User.findById(attendant);
    if (!attendantExists) {
      return next(new AppError('Attendant not found', 404));
    }

    // Resolve business context from authenticated user
    let bookingBusinessId: string | null = null;
    
    bookingBusinessId = req.user.business ? req.user.business.toString() : null;
    if (!bookingBusinessId) {
      return next(new AppError('Authenticated user has no business assignment', 403));
    }

    // Prevent cross-tenant booking assignment
    const attendantBusinessId = attendantExists.business ? attendantExists.business.toString() : null;
    if (!attendantBusinessId || attendantBusinessId !== bookingBusinessId) {
      return next(new AppError('Attendant does not belong to the authenticated business', 403));
    }

    const loyaltyRedemption = await resolveLoyaltyRedemptionFields(
      bookingBusinessId,
      redemptionPointsRequested
    );

    // Create booking data based on category
    const bookingData: any = {
      attendant,
      business: bookingBusinessId,
      amount,
      category,
      paymentType,
      ...(typeof smsConsent === 'boolean' && category !== 'carpet' ? { smsConsent } : {}),
      ...(rewardWashRequested || loyaltyRedemption.isRewardWash
        ? { isRewardWash: true }
        : typeof isRewardWash === 'boolean'
          ? { isRewardWash }
          : {}),
      ...(loyaltyRedemption.loyaltyPointsRedeemed > 0
        ? {
            loyaltyPointsRedeemed: loyaltyRedemption.loyaltyPointsRedeemed,
            loyaltyDiscountKes: loyaltyRedemption.loyaltyDiscountKes
          }
        : {})
    };

    if (category === 'vehicle') {
      bookingData.serviceType = serviceType;
      bookingData.vehicleType = String(vehicleType).trim();

      const trimmedVehicleId =
        typeof vehicleId === 'string' && /^[0-9a-fA-F]{24}$/.test(vehicleId.trim()) ? vehicleId.trim() : '';

      if (trimmedVehicleId) {
        const vehicleDoc = await Vehicle.findById(trimmedVehicleId).populate('customer');
        if (!vehicleDoc || vehicleDoc['business'].toString() !== bookingBusinessId) {
          return next(new AppError('Vehicle not found in your business', 404));
        }

        const linkedCustomer = vehicleDoc['customer'] as {
          _id: { toString: () => string };
          name?: string;
          phoneNumber?: string;
          smsConsent?: boolean;
        } | null;

        if (!linkedCustomer) {
          return next(new AppError('Vehicle is missing customer data', 400));
        }

        bookingData.vehicle = vehicleDoc._id;
        bookingData.customer = linkedCustomer._id;
        bookingData.carRegistrationNumber = vehicleDoc['plate'];
        bookingData.customerName = linkedCustomer['name'];
        bookingData.customerPhoneNumber = linkedCustomer['phoneNumber'];
        bookingData.smsConsent = Boolean(linkedCustomer['smsConsent']);
      } else if (typeof customerId === 'string' && /^[0-9a-fA-F]{24}$/.test(customerId.trim())) {
        const customer = await Customer.findById(customerId.trim());
        if (!customer || customer['business'].toString() !== bookingBusinessId) {
          return next(new AppError('Selected customer not found in your business', 404));
        }

        bookingData.customer = customer._id;
        bookingData.customerName = customer['name'];
        bookingData.customerPhoneNumber = customer['phoneNumber'];
        bookingData.smsConsent = Boolean(customer['smsConsent']);

        const legacyPlate = customer['vehiclePlate'];
        bookingData.carRegistrationNumber = legacyPlate
          ? normalizePlate(String(legacyPlate))
          : normalizePlate(String(carRegistrationNumber));

        if (!bookingData.carRegistrationNumber) {
          return next(new AppError('carRegistrationNumber is required when the customer has no legacy plate', 400));
        }
      } else {
        bookingData.carRegistrationNumber = normalizePlate(String(carRegistrationNumber));

        if (typeof customerPhoneNumber === 'string' && customerPhoneNumber.trim()) {
          bookingData.customerPhoneNumber = normalizePhoneForStorage(customerPhoneNumber);
        }
        if (typeof customerName === 'string' && customerName.trim()) {
          bookingData.customerName = customerName.trim();
        }
      }

      if (typeof smsConsent === 'boolean') {
        bookingData.smsConsent = smsConsent;
      }

      if (!bookingData.vehicle && bookingData.carRegistrationNumber) {
        if (bookingData.customerPhoneNumber) {
          // Full registration: create/link both the vehicle and the customer.
          const registered = await ensureVehicleCustomerRegistration({
            businessId: bookingBusinessId,
            plate: String(bookingData.carRegistrationNumber),
            phoneNumber: String(bookingData.customerPhoneNumber),
            ...(bookingData.customerName ? { customerName: String(bookingData.customerName) } : {}),
            ...(bookingData.vehicleType ? { vehicleType: String(bookingData.vehicleType) } : {}),
            ...(typeof bookingData.smsConsent === 'boolean' ? { smsConsent: bookingData.smsConsent } : {})
          });

          bookingData.vehicle = registered.vehicleId;
          bookingData.customer = registered.customerId;
          bookingData.carRegistrationNumber = registered.plate;
          bookingData.customerName = registered.customerName;
          bookingData.customerPhoneNumber = registered.customerPhoneNumber;
          bookingData.smsConsent = registered.smsConsent;
        } else {
          // Walk-in: register the vehicle only. Customer details (and loyalty)
          // can be added later by editing the booking.
          const registered = await ensureVehicleRegistration({
            businessId: bookingBusinessId,
            plate: String(bookingData.carRegistrationNumber),
            ...(bookingData.vehicleType ? { vehicleType: String(bookingData.vehicleType) } : {})
          });

          bookingData.vehicle = registered.vehicleId;
          bookingData.carRegistrationNumber = registered.plate;

          // If the plate is already owned by a known customer, attribute it.
          if (registered.customerId) {
            bookingData.customer = registered.customerId;
            bookingData.customerName = registered.customerName;
            bookingData.customerPhoneNumber = registered.customerPhoneNumber;
            if (typeof registered.smsConsent === 'boolean') {
              bookingData.smsConsent = registered.smsConsent;
            }
          }
        }
      }
    } else if (category === 'carpet') {
      bookingData.phoneNumber = normalizePhoneForStorage(phoneNumber);
      bookingData.color = color.trim();

      const trimmedCarpetCustomerId =
        typeof customerId === 'string' && /^[0-9a-fA-F]{24}$/.test(customerId.trim()) ? customerId.trim() : '';

      if (trimmedCarpetCustomerId) {
        const linkedCustomer = await Customer.findById(trimmedCarpetCustomerId);
        if (!linkedCustomer || linkedCustomer['business'].toString() !== bookingBusinessId) {
          return next(new AppError('Selected customer not found in your business', 404));
        }

        bookingData.customer = linkedCustomer._id;
        bookingData.customerName = linkedCustomer['name'];
        bookingData.customerPhoneNumber = linkedCustomer['phoneNumber'];
      } else if (bookingData.phoneNumber) {
        const registered = await ensureCustomerRegistration({
          businessId: bookingBusinessId,
          phoneNumber: String(bookingData.phoneNumber),
          ...(bookingData.customerName ? { customerName: String(bookingData.customerName) } : {})
        });

        bookingData.customer = registered.customerId;
        bookingData.customerName = registered.customerName;
        bookingData.customerPhoneNumber = registered.customerPhoneNumber;
      }
    }

    // Add note if provided
    if (note !== undefined) {
      bookingData.note = note.trim();
    }

    // Create new booking
    const newBooking = await Booking.create(bookingData);

    // If booking is created as completed, add it to wallet balance
    // Otherwise, wallet balance remains unchanged (starts at 0)
    if (newBooking.status === 'completed') {
      try {
        const wallet = await Wallet.getOrCreateWallet(attendant);
        wallet.isPaid = false;
        await wallet['addCompletedBooking'](newBooking.amount, newBooking.paymentType);
        if (!newBooking['loyaltyProcessed']) {
          await processCompletedBookingLoyalty(newBooking._id.toString());
        }
      } catch (error) {
        console.error('Error updating wallet balance:', error);
        // Don't fail the booking creation if wallet update fails
      }
    }

    const populatedBooking = await attachBookingPopulates(Booking.findById(newBooking._id));

    res.status(201).json({
      status: 'success',
      data: {
        booking: populatedBooking
      }
    });
  }),

  getAllBookings: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }

    const baseFilter: Record<string, unknown> = {};
    if (!userHasRole(req.user, 'system_admin')) {
      const businessId = req.user.business ? req.user.business.toString() : null;
      if (!businessId) {
        return next(new AppError('User has no business assignment', 403));
      }
      baseFilter['business'] = businessId;
    }

    // Use APIFeatures for searching, filtering, sorting, field limiting and pagination
    const features = new APIFeatures(attachBookingPopulates(Booking.find(baseFilter)), req.query)
      .search()
      .filter()
      .sort()
      .limitFields();

    await features.paginate();

    const bookings = await features.query;

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      total: features.totalCount || 0,
      data: {
        bookings
      }
    });
  }),

  getBooking: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const booking = await attachBookingPopulates(Booking.findById(req.params['id']));

    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }

    if (req.user && !userHasRole(req.user, 'system_admin')) {
      const businessId = req.user.business ? req.user.business.toString() : null;
      if (!businessId || booking.business.toString() !== businessId) {
        return next(new AppError('You do not have permission to view this booking', 403));
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        booking
      }
    });
  }),

  updateBooking: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const {
      carRegistrationNumber,
      phoneNumber,
      color,
      attendant,
      amount,
      serviceType,
      vehicleType,
      category,
      paymentType,
      status,
      note,
      vehicleId,
      customerId,
      customerPhoneNumber,
      customerName,
      smsConsent,
      isRewardWash,
      loyaltyPointsRedeemed
    } = req.body;
    if (category && !['vehicle', 'carpet'].includes(category)) {
      return next(new AppError('Category must be either "vehicle" or "carpet"', 400));
    }

    // Validate service type if provided
    if (serviceType && !['full wash', 'half wash'].includes(serviceType)) {
      return next(new AppError('Service type must be either "full wash" or "half wash"', 400));
    }

    // Validate payment type if provided
    if (paymentType && !['attendant_cash', 'admin_cash', 'admin_till'].includes(paymentType)) {
      return next(new AppError('Payment type must be either "attendant_cash", "admin_cash", or "admin_till"', 400));
    }

    // Validate status if provided
    if (status && !['pending', 'in progress', 'completed', 'cancelled'].includes(status)) {
      return next(new AppError('Status must be either "pending", "in progress", "completed", or "cancelled"', 400));
    }

    // Validate amount if provided
    const updateRedemptionPoints = Math.max(0, Number(loyaltyPointsRedeemed || 0));
    const updateRewardWashRequested = Boolean(isRewardWash) || updateRedemptionPoints > 0;
    if (amount !== undefined && amount < 0) {
      return next(new AppError('Amount cannot be negative', 400));
    }
    if (amount === 0 && !updateRewardWashRequested) {
      return next(new AppError('Amount must be greater than 0', 400));
    }

    if (smsConsent !== undefined && typeof smsConsent !== 'boolean') {
      return next(new AppError('smsConsent must be a boolean', 400));
    }

    if (isRewardWash !== undefined && typeof isRewardWash !== 'boolean') {
      return next(new AppError('isRewardWash must be a boolean', 400));
    }

    if (
      loyaltyPointsRedeemed !== undefined &&
      (!Number.isFinite(Number(loyaltyPointsRedeemed)) || Number(loyaltyPointsRedeemed) < 0)
    ) {
      return next(new AppError('loyaltyPointsRedeemed must be a non-negative number', 400));
    }

    let resolvedCustomerName: string | undefined;
    let resolvedCustomerPhoneNumber: string | undefined;
    let resolvedVehiclePlate: string | undefined;
    let resolvedCustomerConsent: boolean | undefined;
    let vehiclePatch: Record<string, unknown> = {};

    if (vehicleId !== undefined) {
      if (vehicleId !== null && typeof vehicleId !== 'string') {
        return next(new AppError('vehicleId must be a string or null', 400));
      }

      const businessId = req.user?.business ? req.user.business.toString() : null;
      if (!businessId) {
        return next(new AppError('Business context is required', 403));
      }

      if (vehicleId === null || vehicleId === '') {
        vehiclePatch = {
          vehicle: null
        };
      } else {
        const trimmedVehicleId = vehicleId.trim();
        if (!/^[0-9a-fA-F]{24}$/.test(trimmedVehicleId)) {
          return next(new AppError('Invalid vehicle ID format', 400));
        }

        const vehicleDoc = await Vehicle.findById(trimmedVehicleId).populate('customer');
        if (!vehicleDoc || vehicleDoc['business'].toString() !== businessId) {
          return next(new AppError('Vehicle not found in your business', 404));
        }

        const linkedCustomer = vehicleDoc['customer'] as {
          _id: { toString: () => string };
          name?: string;
          phoneNumber?: string;
          smsConsent?: boolean;
        } | null;

        if (!linkedCustomer) {
          return next(new AppError('Vehicle is missing customer data', 400));
        }

        vehiclePatch = {
          vehicle: vehicleDoc._id,
          customer: linkedCustomer._id,
          carRegistrationNumber: vehicleDoc['plate'],
          customerName: linkedCustomer['name'],
          customerPhoneNumber: linkedCustomer['phoneNumber'],
          smsConsent: Boolean(linkedCustomer['smsConsent'])
        };
      }
    } else if (customerId !== undefined) {
      if (customerId !== null && typeof customerId !== 'string') {
        return next(new AppError('customerId must be a string or null', 400));
      }
      if (typeof customerId === 'string' && customerId.trim()) {
        const customer = await Customer.findById(customerId.trim());
        const businessId = req.user?.business ? req.user.business.toString() : null;
        if (!customer || !businessId || customer['business'].toString() !== businessId) {
          return next(new AppError('Selected customer not found in your business', 404));
        }
        resolvedCustomerName = customer['name'];
        resolvedCustomerPhoneNumber = customer['phoneNumber'];
        resolvedVehiclePlate = customer['vehiclePlate']
          ? String(customer['vehiclePlate']).toUpperCase().trim()
          : undefined;
        resolvedCustomerConsent = customer['smsConsent'];
      }
    }

    // Check if attendant exists if provided
    if (attendant) {
      const attendantExists = await User.findById(attendant);
      if (!attendantExists) {
        return next(new AppError('Attendant not found', 404));
      }
    }

    // Get the original booking to check for changes that affect wallet
    const originalBooking = await Booking.findById(req.params['id']);
    if (!originalBooking) {
      return next(new AppError('Booking not found', 404));
    }

    const categoryAfterPatch =
      category ?? (originalBooking.category as 'vehicle' | 'carpet');
    const treatAsVehicleBooking = categoryAfterPatch === 'vehicle';

    // Admin adds customer details to a walk-in vehicle booking after creation:
    // resolve/create the customer, link them to the booking's vehicle, and
    // attach the customer to the booking so loyalty can apply going forward.
    let addedCustomerPatch: Record<string, unknown> = {};
    if (
      treatAsVehicleBooking &&
      vehicleId === undefined &&
      customerId === undefined &&
      typeof customerPhoneNumber === 'string' &&
      customerPhoneNumber.trim()
    ) {
      const linkBusinessId = req.user?.business
        ? req.user.business.toString()
        : originalBooking.business.toString();
      try {
        const linked = await linkCustomerToVehicle({
          businessId: linkBusinessId,
          vehicleId: originalBooking.vehicle ?? null,
          phoneNumber: customerPhoneNumber,
          ...(typeof customerName === 'string' && customerName.trim()
            ? { customerName }
            : {}),
          ...(typeof smsConsent === 'boolean' ? { smsConsent } : {})
        });

        addedCustomerPatch = {
          customer: linked.customerId,
          customerName: linked.customerName,
          customerPhoneNumber: linked.customerPhoneNumber,
          ...(categoryAfterPatch !== 'carpet' ? { smsConsent: linked.smsConsent } : {})
        };
      } catch (linkError) {
        return next(
          new AppError(
            linkError instanceof Error ? linkError.message : 'Failed to link customer to booking',
            400
          )
        );
      }
    }

    // Determine final attendant for wallet calculations
    const finalAttendant = attendant || originalBooking.attendant;
    const originalAttendant = originalBooking.attendant;

    // Check if wallet-affecting fields have changed
    const amountChanged = amount !== undefined && amount !== originalBooking.amount;
    const attendantChanged = attendant !== undefined && attendant.toString() !== originalAttendant.toString();
    const paymentTypeChanged = paymentType !== undefined && paymentType !== originalBooking.paymentType;
    const statusChanged = status !== undefined && status !== originalBooking.status;
    const statusChangedToCompleted = statusChanged && status === 'completed';
    const statusChangedFromCompleted = statusChanged && originalBooking.status === 'completed' && status !== 'completed';
    const wasCompleted = originalBooking.status === 'completed';
    const finalAmount = amount !== undefined ? amount : originalBooking.amount;
    const finalPaymentType = paymentType !== undefined ? paymentType : originalBooking.paymentType;

    // Update wallet balances incrementally
    try {
      // Case 1: Status changed from completed to something else - remove from wallet
      if (statusChangedFromCompleted) {
        const originalWallet = await Wallet.getOrCreateWallet(originalAttendant);
        await originalWallet['removeCompletedBooking'](originalBooking.amount, originalBooking.paymentType);
      }

      // Case 2: Status changed to completed - add to wallet
      if (statusChangedToCompleted) {
        const targetWallet = await Wallet.getOrCreateWallet(finalAttendant);
        await targetWallet['addCompletedBooking'](finalAmount, finalPaymentType);
      }

      // Case 3: Booking was completed and amount/paymentType changed - update incrementally
      if (wasCompleted && !statusChanged && (amountChanged || paymentTypeChanged)) {
        const originalWallet = await Wallet.getOrCreateWallet(originalAttendant);
        // Remove old booking contribution
        await originalWallet['removeCompletedBooking'](originalBooking.amount, originalBooking.paymentType);
        // Add new booking contribution
        await originalWallet['addCompletedBooking'](finalAmount, finalPaymentType);
      }

      // Case 4: Booking was completed and attendant changed - move between wallets
      if (wasCompleted && attendantChanged) {
        // Remove from original attendant's wallet
        const originalWallet = await Wallet.getOrCreateWallet(originalAttendant);
        await originalWallet['removeCompletedBooking'](finalAmount, finalPaymentType);
        // Add to new attendant's wallet
        const newWallet = await Wallet.getOrCreateWallet(finalAttendant);
        await newWallet['addCompletedBooking'](finalAmount, finalPaymentType);
      }

      // Case 5: Booking was completed, attendant changed, AND amount/paymentType changed
      if (wasCompleted && attendantChanged && (amountChanged || paymentTypeChanged)) {
        // Remove old booking from original attendant
        const originalWallet = await Wallet.getOrCreateWallet(originalAttendant);
        await originalWallet['removeCompletedBooking'](originalBooking.amount, originalBooking.paymentType);
        // Add new booking to new attendant
        const newWallet = await Wallet.getOrCreateWallet(finalAttendant);
        await newWallet['addCompletedBooking'](finalAmount, finalPaymentType);
      }
    } catch (error) {
      console.error('Error updating wallet balances:', error);
      // Don't fail the booking update if wallet update fails, but log the error
    }

    const businessIdForLoyalty = req.user?.business ? req.user.business.toString() : originalBooking.business.toString();
    const loyaltyRedemptionPatch =
      loyaltyPointsRedeemed !== undefined
        ? await resolveLoyaltyRedemptionFields(businessIdForLoyalty, updateRedemptionPoints)
        : null;

    const booking = await attachBookingPopulates(
      Booking.findByIdAndUpdate(
        req.params['id'],
        {
          ...(statusChangedFromCompleted ? { loyaltyProcessed: false } : {}),
          ...(carRegistrationNumber && { carRegistrationNumber: normalizePlate(String(carRegistrationNumber)) }),
          ...(phoneNumber && { phoneNumber: normalizePhoneForStorage(phoneNumber) }),
          ...(color && { color: color.trim() }),
          ...(attendant && { attendant }),
          ...(amount !== undefined && { amount }),
          ...(serviceType && { serviceType }),
          ...(vehicleType && { vehicleType: vehicleType.trim() }),
          ...(category && { category }),
          ...(paymentType && { paymentType }),
          ...(status && { status }),
          ...(note !== undefined && { note: note ? note.trim() : null }),
          ...(vehicleId === undefined && customerId !== undefined && { customer: customerId || null }),
          ...(vehicleId === undefined &&
            resolvedVehiclePlate !== undefined &&
            treatAsVehicleBooking && {
              carRegistrationNumber: resolvedVehiclePlate
            }),
          ...(customerPhoneNumber !== undefined && {
            customerPhoneNumber: customerPhoneNumber ? customerPhoneNumber.trim() : null
          }),
          ...(vehicleId === undefined && resolvedCustomerPhoneNumber !== undefined && {
            customerPhoneNumber: resolvedCustomerPhoneNumber
          }),
          ...(customerName !== undefined && { customerName: customerName ? customerName.trim() : null }),
          ...(vehicleId === undefined && resolvedCustomerName !== undefined && {
            customerName: resolvedCustomerName
          }),
          ...(vehicleId === undefined &&
            resolvedCustomerConsent !== undefined &&
            categoryAfterPatch !== 'carpet' && {
              smsConsent: resolvedCustomerConsent
            }),
          ...(isRewardWash !== undefined && { isRewardWash }),
          ...(loyaltyRedemptionPatch
            ? {
                loyaltyPointsRedeemed: loyaltyRedemptionPatch.loyaltyPointsRedeemed,
                loyaltyDiscountKes: loyaltyRedemptionPatch.loyaltyDiscountKes,
                ...(loyaltyRedemptionPatch.isRewardWash ? { isRewardWash: true } : {})
              }
            : {}),
          ...(Object.keys(vehiclePatch).length > 0 ? vehiclePatch : {}),
          ...(smsConsent !== undefined && categoryAfterPatch !== 'carpet' && { smsConsent }),
          ...(Object.keys(addedCustomerPatch).length > 0 ? addedCustomerPatch : {})
        },
        {
          new: true,
          runValidators: true
        }
      )
    );

    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }

    if (booking.status === 'completed' && !booking['loyaltyProcessed']) {
      try {
        await processCompletedBookingLoyalty(booking._id.toString());
      } catch (error) {
        console.error('Error processing loyalty for completed booking:', error);
        if (process.env['NODE_ENV'] === 'development' && error instanceof Error) {
          console.error(error.stack);
        }
      }
    } else if (
      process.env['NODE_ENV'] === 'development' &&
      booking.status === 'completed' &&
      booking['loyaltyProcessed']
    ) {
      console.warn(`[loyalty] booking ${booking._id.toString()} already marked loyaltyProcessed`);
    }

    res.status(200).json({
      status: 'success',
      data: {
        booking
      }
    });
  }),

  deleteBooking: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    // Get the booking before deleting to update wallet balance
    const booking = await Booking.findById(req.params['id']);

    if (!booking) {
      return next(new AppError('Booking not found', 404));
    }

    // Remove booking from wallet balance if it was completed
    if (booking.status === 'completed') {
      try {
        const wallet = await Wallet.getOrCreateWallet(booking.attendant);
        await wallet['removeCompletedBooking'](booking.amount, booking.paymentType);
      } catch (error) {
        console.error('Error updating wallet balance for deleted booking:', error);
        // Don't fail the deletion if wallet update fails, but log the error
      }
    }

    // Delete the booking
    await Booking.findByIdAndDelete(req.params['id']);

    res.status(204).json({
      status: 'success',
      data: null
    });
  }),

  getBookingsByAttendant: catchAsync(async (req: IRequestWithUser, res: Response, _next: NextFunction) => {
    const bookings = await attachBookingPopulates(
      Booking.find({ attendant: req.params['attendantId'] }).sort({ createdAt: -1 })
    );

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      data: {
        bookings
      }
    });
  }),

  getBookingsByStatus: catchAsync(async (req: IRequestWithUser, res: Response, next: NextFunction) => {
    const status = req.params['status'];

    if (!status || !['pending', 'in progress', 'completed', 'cancelled'].includes(status)) {
      return next(new AppError('Status must be either "pending", "in progress", "completed", or "cancelled"', 400));
    }

    const bookings = await attachBookingPopulates(Booking.find({ status }).sort({ createdAt: -1 }));

    res.status(200).json({
      status: 'success',
      results: bookings.length,
      data: {
        bookings
      }
    });
  })
};

export default bookingController;
